# Build stage
FROM oven/bun:1.4.5-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Production stage: unprivileged nginx (UID 101), works with readOnlyRootFilesystem
# as long as /tmp is writable (e.g. an emptyDir).
FROM ghcr.io/nginx/nginx-unprivileged:1.30.6-alpine@sha256:ea4fd7ab5a8dc6348c18240bd3546f355f8373cd8f112580f7d8bd8ff5a74772

# SARTOR_API_URL: upstream for /api/ (scheme://host:port, no path).
# SARTOR_API_KEY: optional key sent to the server as X-API-Key; mount it from a Secret.
# The entrypoint renders /etc/nginx/templates/*.template into /tmp at startup.
ENV SARTOR_API_URL=http://sartor-server:8080 \
    SARTOR_API_KEY="" \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER=^SARTOR_

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

USER 101:101

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
