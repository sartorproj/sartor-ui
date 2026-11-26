#!/usr/bin/env bash
# Smoke-tests a built sartor-ui image: hardened startup, the /api/ proxy and its
# failure modes, API key handling, and the rendered nginx configuration.
#
# Usage: tests/image-smoke.sh [image]   (default: sartor-ui:test)
# SMOKE_NETWORK=bridge (default) runs a stub API on a user-defined Docker network and
# reaches it by container name through Docker's DNS. SMOKE_NETWORK=host runs everything
# on the host network and reaches the stub as "localhost" through the host's DNS server.
set -euo pipefail

IMAGE="${1:-sartor-ui:test}"
MODE="${SMOKE_NETWORK:-bridge}"
PREFIX="sartor-ui-smoke-$$"
STUB_PORT=18090
HARDEN=(--read-only --tmpfs "/tmp:rw,size=16m" --cap-drop ALL --security-opt no-new-privileges)

failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }

cleanup() {
    docker ps -aq --filter "name=^${PREFIX}" | xargs -r docker rm -f >/dev/null 2>&1 || true
    if [ "$MODE" = bridge ]; then
        docker network rm "$PREFIX" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if [ "$MODE" = bridge ]; then
    docker network create "$PREFIX" >/dev/null
    NET=(--network "$PREFIX")
    STUB_URL="http://${PREFIX}-stub:${STUB_PORT}"
else
    NET=(--network host)
    STUB_URL="http://localhost:${STUB_PORT}"
fi

# The stub is nginx from the image under test; it echoes the request URI and API key.
STUB_CONF="pid /tmp/stub.pid; error_log /dev/stderr; events {}
http {
  access_log off;
  client_body_temp_path /tmp/cb; proxy_temp_path /tmp/pt; fastcgi_temp_path /tmp/ft;
  uwsgi_temp_path /tmp/ut; scgi_temp_path /tmp/st;
  server {
    listen ${STUB_PORT};
    location / { default_type text/plain; return 200 \"stub uri=\$request_uri key=\$http_x_api_key\"; }
  }
}"
docker run -d --name "${PREFIX}-stub" "${NET[@]}" "${HARDEN[@]}" --entrypoint sh "$IMAGE" \
    -c 'printf "%s" "$0" > /tmp/stub.conf && exec nginx -c /tmp/stub.conf -g "daemon off;"' "$STUB_CONF" >/dev/null
sleep 2
if [ "$(docker inspect -f '{{.State.Running}}' "${PREFIX}-stub")" != true ]; then
    echo "FAIL: stub API did not start"
    docker logs "${PREFIX}-stub" 2>&1 | tail -n 20
    exit 1
fi

# start_ui NAME [docker run args...]: starts the UI and sets UI_URL once / answers.
start_ui() {
    local name="${PREFIX}-$1"
    shift
    if [ "$MODE" = bridge ]; then
        docker run -d --name "$name" "${NET[@]}" "${HARDEN[@]}" -p 127.0.0.1::5173 "$@" "$IMAGE" >/dev/null
        UI_URL="http://$(docker port "$name" 5173/tcp | head -n1)"
    else
        docker run -d --name "$name" "${NET[@]}" "${HARDEN[@]}" "$@" "$IMAGE" >/dev/null
        UI_URL="http://127.0.0.1:5173"
    fi
    for _ in $(seq 1 30); do
        if curl -fsS -o /dev/null -m 2 "$UI_URL/" 2>/dev/null; then
            return 0
        fi
        if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
            break
        fi
        sleep 1
    done
    fail "$name did not start serving"
    docker logs "$name" 2>&1 | tail -n 20
    return 1
}

stop_ui() { docker rm -f "${PREFIX}-$1" >/dev/null; }

# expect PATH STATUS [BODY] [curl args...]
expect() {
    local path="$1" want_status="$2" want_body="${3:-}"
    shift 3 || shift $#
    local out status body
    out=$(curl -sS -m 15 -w '\n%{http_code}' "$@" "$UI_URL$path" || true)
    status="${out##*$'\n'}"
    body="${out%$'\n'*}"
    if [ "$status" != "$want_status" ]; then
        fail "$CASE: GET $path returned $status, want $want_status"
    elif [ -n "$want_body" ] && [ "$body" != "$want_body" ]; then
        fail "$CASE: GET $path body '$body', want '$want_body'"
    else
        pass "$CASE: GET $path -> $status${want_body:+ \"$want_body\"}"
    fi
}

CASE="rendered config"
config=$(docker run --rm "${HARDEN[@]}" -e SARTOR_API_URL="$STUB_URL" "$IMAGE" nginx -T 2>/dev/null \
    | sed -e 's/#.*//' | grep -v '^[[:space:]]*$')
if grep -Eq '(^|[;{[:space:]])(ssi|mirror|auth_request|sub_filter|add_before_body|add_after_body|slice|perl[a-z_]*|js_[a-z_]+|load_module|proxy_store)[[:space:]]' <<<"$config"; then
    fail "$CASE: subrequest-capable or dynamic-module directive present"
else
    pass "$CASE: no ssi/mirror/auth_request/addition/sub_filter/slice/perl/njs/load_module directives"
fi
if grep -Eq '^[[:space:]]*http2 off;' <<<"$config" && grep -Eq '^[[:space:]]*http3 off;' <<<"$config" \
    && ! grep -Eq 'http2 on|http3 on|quic_[a-z_]+|listen[^;]*(http2|quic)' <<<"$config"; then
    pass "$CASE: http2 and http3 are off"
else
    fail "$CASE: http2/http3 not explicitly disabled"
fi

CASE="unset SARTOR_API_URL"
start_ui unset
expect / 200
expect /api/v1/tailorings 502
if [ "$(docker exec "${PREFIX}-unset" id -u)" = 101 ]; then pass "$CASE: runs as UID 101"; else fail "$CASE: not UID 101"; fi
stop_ui unset

CASE="unresolvable SARTOR_API_URL"
start_ui unresolvable -e SARTOR_API_URL=http://sartor-server.invalid:8080
expect / 200
expect /api/v1/tailorings 502
stop_ui unresolvable

CASE="SARTOR_API_URL with a path"
start_ui withpath -e SARTOR_API_URL="$STUB_URL/api"
expect /api/v1/tailorings 502
stop_ui withpath

CASE="resolvable upstream, no key"
start_ui nokey -e SARTOR_API_URL="$STUB_URL"
expect "/api/v1/tailorings?namespace=apps" 200 "stub uri=/api/v1/tailorings?namespace=apps key="
expect /api/v1/atelier 200 "stub uri=/api/v1/atelier key=" -H 'X-API-Key: from-browser'
stop_ui nokey

CASE="resolvable upstream, SARTOR_API_KEY set"
start_ui key -e SARTOR_API_URL="$STUB_URL/" -e SARTOR_API_KEY=test-key
expect /api/v1/atelier 200 "stub uri=/api/v1/atelier key=test-key"
expect /api/v1/atelier 200 "stub uri=/api/v1/atelier key=test-key" -H 'X-API-Key: from-browser'
expect / 200
stop_ui key

if [ "$failures" -ne 0 ]; then
    echo "$failures check(s) failed"
    exit 1
fi
echo "All checks passed"
