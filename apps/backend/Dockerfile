# Build context: raíz del monorepo (necesita packages/shared y pnpm-workspace.yaml).
# docker-compose.prod.yml lo referencia con `context: .`, `dockerfile: apps/backend/Dockerfile`.
#
# No se usa `pnpm deploy`/prune agresivo a propósito: se prioriza que el
# build funcione de forma predecible sobre el tamaño mínimo de imagen —
# node_modules de pnpm usa symlinks relativos dentro de .pnpm/, así que
# copiar el árbol completo entre stages es seguro. Optimizar el tamaño
# queda como mejora futura, no bloquea el deploy.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @diktya-atlas/shared build \
 && pnpm --filter backend prisma:generate \
 && pnpm --filter backend build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/backend ./apps/backend
WORKDIR /app/apps/backend

# El servicio real (api vs. cada worker) lo define `command:` en
# docker-compose.prod.yml — este CMD es el default (API) para poder correr
# la imagen suelta (ej. debug local) sin pisar nada.
CMD ["node", "dist/server.js"]
