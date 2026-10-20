# The whole app in one image: the simulator (built with Vite) served by the Go server,
# which also answers /api and /uploads on the same address. Run it with docker-compose.yml.

# 1. The simulator
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html admin.html maket.html vite.config.js ./
COPY src src
COPY public public
COPY tools tools
# "/": the API is on the same address as the site
# hashed file names: the offline cache (sw.js) keeps assets/ forever, so a new build needs new names
ENV VITE_API_URL=/ HASHED=1
# readable by the server whatever the files' modes were on the build machine
RUN npm run build && chmod -R a+rX dist

# 2. The server
FROM golang:1.22-alpine AS api
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /avtodrom-server .

# 3. The image that runs
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -H -u 10001 avtodrom \
  && mkdir -p /data/uploads && chown avtodrom /data/uploads
COPY --from=api /avtodrom-server /usr/local/bin/avtodrom-server
COPY --from=web /web/dist /srv/www
ENV ADDR=:8080 STATIC_DIR=/srv/www UPLOAD_DIR=/data/uploads
USER avtodrom
VOLUME /data/uploads
EXPOSE 8080
CMD ["avtodrom-server"]
