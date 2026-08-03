# Caddy estándar no trae proveedores DNS — hace falta el módulo de
# Cloudflare para el desafío DNS-01 (ver Caddyfile: `tls { dns cloudflare }`).
# xcaddy compila un binario de Caddy a medida con ese módulo agregado.
FROM caddy:2-builder-alpine AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
