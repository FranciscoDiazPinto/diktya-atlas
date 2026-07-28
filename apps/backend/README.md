# NetBot backend

Backend inicial de NetBot (Diktya Atlas): Fastify + Prisma/Postgres +
BullMQ/Redis, orquestador LLM con tools filtradas por rol, y el flujo de
VLAN reserva→lock→escritura→verificación→rollback descrito en el prompt de
arquitectura.

## Requisitos

- Node.js **>= 22** (el repo trae `.nvmrc` con `24`; correr `nvm use` en la
  raíz del monorepo). El Node del sistema puede ser más viejo — no alcanza
  para pnpm ni para algunas dependencias.
- pnpm (via `corepack enable`, o `npx pnpm`).
- Docker, para Postgres y Redis locales.

## Arranque local

Desde la raíz del monorepo (`diktya-atlas/`):

```bash
nvm use
pnpm install

# Levanta Postgres (5432) y Redis (6379) locales
docker compose up -d   # o `docker-compose up -d` según tu instalación

# apps/backend/.env — copiar de .env.example y ajustar si hace falta.
# Los valores por defecto ya apuntan al docker-compose de arriba.
cp .env.example apps/backend/.env

cd apps/backend
npx prisma migrate dev   # crea el schema
npx prisma db seed       # crea los 3 usuarios de desarrollo (ver Auth)

pnpm dev                 # levanta el servidor Fastify en :3000
```

En terminales separadas, cada worker (para poder reiniciarlos/escalarlos
independientemente, como pide el prompt):

```bash
pnpm worker:monitor
pnpm worker:triage
pnpm worker:remediation
pnpm worker:ticket-followup
```

`GET http://localhost:3000/health` para confirmar que el servidor levantó.

## Auth

JWT (access token 15 min) + refresh token opaco en cookie httpOnly con
rotación (detecta reuso y revoca toda la sesión) + 2FA TOTP obligatorio
para ADMIN/TECNICO. Detalle completo, matriz de permisos y estrategia de
despliegue en [`SECURITY.md`](../../SECURITY.md) (raíz del repo).

Los 3 usuarios sembrados por el seed (`admin@dev.local`,
`tecnico@dev.local`, `visualizador@dev.local`) comparten la password
`NetBotDev123!` (dev-only, ver `prisma/seed.ts`) y arrancan sin 2FA
configurado — el primer login de ADMIN/TECNICO dispara el flujo de setup.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"visualizador@dev.local","password":"NetBotDev123!"}'
# -> {"status":"ok","accessToken":"...", "user": {...}}, cookie de refresh en Set-Cookie

curl http://localhost:3000/network/status -H "authorization: Bearer <accessToken>"
```

**Fallback de dev**: con `ALLOW_DEV_ROLE_HEADER=true` (default fuera de
producción), las rutas también aceptan `x-role`/`x-user-id` sin JWT, para
scripts rápidos de curl. Se fuerza a `false` automáticamente si
`NODE_ENV=production` — nunca desplegar con esto habilitado.

## UniFi: mock vs live

`UNIFI_MODE=mock` (default) usa un cliente en memoria, sin tocar
infraestructura real — así corren los tests y el flujo end-to-end sin
credenciales. `UNIFI_MODE=live` requiere `UNIFI_HOST`, `UNIFI_USERNAME`,
`UNIFI_PASSWORD` y usa el cliente HTTP real contra el Controller
(`src/integrations/unifi/liveClient.ts` — no validado todavía contra un
controller real, probar en staging antes de usar en producción).

## Tests

```bash
pnpm test
```

Corre contra Postgres/Redis reales (los del `docker compose up -d` de
arriba) con `UNIFI_MODE=mock`. Cubre: el cliente UniFi mock, el 409 de
reserva de VLAN duplicada, el flujo end-to-end completo (CSV → plan →
reserva → aplicar, pasando por lock distribuido + verificación
post-escritura), y auth (password, TOTP, rotación de sesión con detección
de reuso, y las rutas de `/auth/*` con `app.inject()` end-to-end).

## Flujo end-to-end de ejemplo

1. `POST /csv/upload` (multipart, campo de archivo) → valida fila por fila
   → genera el plan de cambios (diff) contra UniFi. No escribe nada.
2. `POST /vlan/reserve { planId }` → reserva cada ítem del plan (409 si
   alguno ya tiene una reserva activa en esa VLAN+sitio).
3. Confirmación explícita del usuario (a implementar en el frontend).
4. `POST /vlan/apply { reservationId }` → encola el trabajo real en
   `remediation-queue`; `worker-remediation` es el único que escribe de
   verdad, siempre bajo lock + verificación post-escritura + rollback.

## Fuera de alcance

Cliente OPNsense real, llamadas LLM en vivo sin API key configurada,
auth del WebSocket (`GET /ws`), y UI de gestión de usuarios/roles — ver el
detalle de cada uno en [`SECURITY.md`](../../SECURITY.md#pendientes-explícitos-fuera-de-alcance-de-esta-pasada).
