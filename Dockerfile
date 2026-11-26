# Build stage
FROM oven/bun:1.4.5-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Production stage: unprivileged nginx (UID 101), works with readOnlyRootFilesystem
# as long as /tmp is writable (e.g. an emptyDir).
FROM ghcr.io/nginx/nginx-unprivileged:1.30.7-alpine@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd

# Runtime configuration, read at container start (see README):
#   SARTOR_API_URL  upstream for /api/ (scheme://fqdn[:port], no path); unset means /api/ returns 502.
#   SARTOR_API_KEY  optional key sent to the server as X-API-Key; mount it from a Secret.
# 18-sartor-api.envsh validates them, then the entrypoint renders the template into /tmp.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER=^SARTOR_

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0755 nginx/18-sartor-api.envsh /docker-entrypoint.d/18-sartor-api.envsh
COPY --from=builder /app/dist /usr/share/nginx/html

USER 101:101

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
