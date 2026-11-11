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
2. `POST /vlan/reserve { planId, version, fingerprint }` → reserva cada ítem del plan (409 si
   alguno ya tiene una reserva activa en esa VLAN+sitio).
3. Revisar cada fila y confirmar explícitamente en el diálogo del frontend.
4. `POST /vlan/apply { reservationId, version, fingerprint, confirm: true }` → registra la aprobación y encola el trabajo real en
   `remediation-queue`; `worker-remediation` es el único que escribe de
   verdad, siempre bajo lock + verificación post-escritura + rollback.

## Fuera de alcance

Cliente OPNsense real, llamadas LLM en vivo sin API key configurada,
auth del WebSocket (`GET /ws`), y UI de gestión de usuarios/roles — ver el
detalle de cada uno en [`SECURITY.md`](../../SECURITY.md#pendientes-explícitos-fuera-de-alcance-de-esta-pasada).

## Conversaciones privadas

Aplicar las migraciones y generar el cliente Prisma antes de iniciar esta versión:
`pnpm prisma:generate` y `pnpm prisma:migrate:deploy` desde `apps/backend`.
La migración `20261110120000_private_conversations` agrega conversaciones y mensajes;
no importa el historial antiguo del navegador porque no tiene propietario verificable.
Desplegar frontend y backend juntos: el contrato de `POST /chat` cambió.

- `POST /chat/conversations`: crea una conversación del usuario autenticado.
- `GET /chat/conversations?offset=0&limit=30`: lista conversaciones propias, ordenadas por actividad.
- `GET /chat/conversations/:id?limit=100&before=20`: recupera mensajes anteriores
  a la secuencia indicada. `nextBefore=null` indica que no quedan páginas.
- `DELETE /chat/conversations/:id`: elimina la conversación propia y sus mensajes.
- `POST /chat { conversationId, version, message }`: usa exclusivamente el historial
  del servidor y devuelve `{ conversationId, version, mensaje, toolResults }`.
  Rechaza `history`, identidad y otros campos adicionales. La versión inicial es 0.

Ni admin puede acceder a conversaciones ajenas. Se comprueba el rol actual en la
base de datos y se impide continuar conversaciones creadas con otro rol. La pregunta
y respuesta se guardan juntas; el historial no conserva resultados crudos de tools.
La solicitud simultánea o con versión antigua devuelve 409 sin invocar el LLM.
Un fallo del proveedor libera el turno sin guardar mensajes parciales.

Si el proceso muere durante un turno, la marca `pending` se conserva para evitar
repetir acciones automáticamente. El historial confirmado sigue disponible;
crear una nueva conversación permite continuar. La reconciliación automática de
turnos interrumpidos queda pendiente. Esta transacción protege los mensajes,
no revierte acciones de herramientas: la separación de propuesta/aprobación es
la siguiente etapa del [plan de mejoras](../../docs/atlas-improvement-plan.md).


## Aprobación explícita de cambios de red

Las propuestas se guardan en PostgreSQL (`network_change_plans`), no en Redis.
Cada una es inmutable, pertenece a su creador y rol, tiene versión, huella de
contenido y vencimiento de 30 minutos. Cambiar una propuesta requiere generar
otra. Se vincula al modo mock/live y al controlador configurado mediante una
huella sin credenciales; cambiar de entorno/controlador invalida su ejecución.
El CSV acepta hasta 500 filas válidas y rechaza SSID/sitio duplicados.

El LLM conserva `propose_vlan_plan`, pero ya no tiene `reserve_vlan` ni
`apply_vlan_plan`. Las herramientas restantes de tickets/planos conservan su
comportamiento; esta entrega separa específicamente las escrituras de red.

- `GET /vlan/plans?offset=0&limit=20`: recuperar propuestas propias.
- `GET /vlan/plans/:id`: propuesta y estados de sus reservas, sin ejecutar nada.
- `POST /vlan/reserve { planId, version, fingerprint }`: reservar filas del plan
  revisado; devolver las reservas existentes del mismo plan permite retomar la UI.
- `POST /vlan/apply { reservationId, version, fingerprint, confirm: true }`:
  aprobar únicamente esa fila. La aprobación registra actor, rol, huella, versión,
  fecha y vencimiento (10 minutos o vencimiento del plan, lo que ocurra primero).
- `POST /vlan/release { reservationId, version, fingerprint }`: liberar una reserva
  propia pendiente/bloqueada o con rollback verificado. No revierte configuración;
  rechaza reservas aplicadas, ejecutándose o inciertas. Permite liberar planes vencidos.

El trabajo BullMQ solo lleva `reservationId` y `approvalId`. El worker reconstruye
la configuración desde el plan aprobado, revalida identidad/rol, vigencia,
instantánea y entorno después de las esperas externas y toma la aprobación con
una actualización condicional antes de escribir. Se mantienen lock distribuido,
comparación remota y verificación/rollback. La unicidad SQL ahora aplica solo a
reservas activas, conservando múltiples aplicaciones/liberaciones históricas.

Estados: `APPROVED` (encolado no confirmado), `QUEUED`, `EXECUTING`, `APPLIED`
(escritura verificada), `BLOCKED`, `FAILED` (rollback verificado) y `UNCERTAIN`.
Un fallo de cola conserva la aprobación y permite reintentar con el mismo jobId;
no crea otra aprobación. Un fallo después de intentar escribir deja resultado
incierto y no repite la escritura automáticamente. Si el proceso muere tras tomar
la aprobación, `EXECUTING` se conserva; requiere conciliación técnica, no reset
manual a `APPROVED`. Recuperación automática/outbox y conciliación completa quedan
para la etapa 5. El resultado HTTP de encolado no acredita despliegue.

### Actualización

Detener servidor y workers anteriores, respaldar la base y aplicar migraciones
con `pnpm prisma:migrate:deploy`; regenerar Prisma y desplegar frontend/backend/
workers juntos. Las migraciones nuevas son `20261110130000_explicit_network_approval`
y `20261110140000_active_vlan_reservation_index` (además de la de conversaciones).
Los planes anteriores de Redis no se importan. Los trabajos antiguos sin aprobación
válida se rechazan sin escribir; revisar las reservas anteriores antes de liberarlas
manualmente. No convertir reservas antiguas en aprobaciones como parte de la migración.

Las pruebas `networkApproval.routes.test.ts` usan PostgreSQL real de test, UniFi
simulado y sustitutos de cola/lock/eventos. Cubren permisos, confirmación, alteración,
vencimiento, concurrencia, reintento de cola, cambio de entorno, revalidación tras
esperas, liberación e incertidumbre. No sustituyen laboratorio con controlador real.
