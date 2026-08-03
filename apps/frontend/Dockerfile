# Build context: raíz del monorepo (necesita packages/shared) — mismo
# criterio que apps/backend/Dockerfile. Sirve el SPA con un Caddy interno
# liviano (SPA fallback a index.html); el Caddy de borde
# (deploy/Caddyfile) es el que termina TLS y reenvía acá + a /api.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
# Vite hornea las env vars VITE_* en el bundle en build-time, no en runtime
# — por eso es un build ARG, no algo que se pueda cambiar en el contenedor
# ya armado. /api es el path que el Caddy de borde reenvía al backend (ver
# deploy/Caddyfile) — mismo origen que el frontend, sin CORS en producción.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @diktya-atlas/shared build \
 && pnpm --filter frontend build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/frontend/dist /srv
COPY apps/frontend/deploy.Caddyfile /etc/caddy/Caddyfile
