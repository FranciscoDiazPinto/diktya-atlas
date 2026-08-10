---
tags: [atlas, argos, deploy, infraestructura]
updated: 2026-08-10
---

# Despliegue a producción — ARGOS (antes "NetBot")

Módulo de [[Proyecto Atlas]] — artefactos y runbook para llevar el software (no la infra real de
eventos, ver [[Infraestructura Real]]) a un ambiente de producción de verdad. Detalle técnico
completo vive en el repo (`DEPLOY.md`, `SECURITY.md` § Estrategia de despliegue) — esta nota es el
resumen de decisiones y estado.

## LA VM YA EXISTE — entregada 2026-08-07, reverificada 2026-08-10

Ya no hay que provisionar nada de infraestructura — Lucas ya la creó. VMID 240 (`argos`), en
`DIKTYA-SMV-01` (RACK-A), VLAN 25 `MGMT_SERVICIOS`, IP `10.100.25.240/24`, 4 vCPU/8 GB RAM/60 GB
disco, Debian 12, Docker 29.7.2 + Compose v5.4.0, `/opt/argos` vacío y listo para el primer
`docker compose up`. Detalle completo, incluidas las reglas duras que se derivan de esta
ubicación (misma VLAN que ATLAS, opera sin WAN) → [[ARGOS Arquitectura y Entrega 2026-08-10]].
**Esto reemplaza por completo la sección de "Host" de abajo, que queda como historial.**

## Decisiones acordadas con el usuario (2026-08-03, host superado 2026-08-07, VM entregada 2026-08-07)

- **Host — histórico**: originalmente "una máquina dedicada que el cliente va a proveer"
  (2026-08-03), después "VM en Proxmox real, ubicación a definir con Lucas" (2026-08-07) — **hoy
  ya no es una decisión pendiente**: la VM concreta existe y está arriba, ver sección de arriba.
- **Acceso remoto del equipo — matizado 2026-08-10**: ZeroTier (red `diktya-atlas-mgmt`,
  `76fc96e498382f09`) sigue siendo la vía de **desarrollo remoto** de Francisco hacia la VM
  (`ssh -p 2240 argos@10.71.111.101`) — sigue vigente esa parte. Pero **no es ni debe ser** cómo
  ARGOS opera: la VM vive en la VLAN 25 junto a ATLAS y no necesita el overlay para nada de su
  funcionamiento — meter un cliente ZeroTier dentro de la VM está explícitamente prohibido (ver
  [[ARGOS Arquitectura y Entrega 2026-08-10]]). Se descartó Tailscale, la recomendación original
  de `SECURITY.md`, para no sumar una herramienta nueva sin necesidad — sigue siendo la elección
  para el acceso de desarrollo, no para el producto.
- **LLM en producción**: OpenRouter de pago (`anthropic/claude-sonnet-4.5`) como interino,
  mientras se define el hardware on-prem — ver [[LLM y tools]] / `project_local_llm` en memoria.
  No bloquea el deploy.
- **Milestone de revisión de seguridad** (ver [[Infraestructura Real]] § gobernanza): gate para
  operar un **evento real**, no para terminar esta infraestructura técnica — no confundir "deploy
  listo" con "listo para el primer evento real".

## Topología

Hostname real ya decidido: **`argos.diktya.cl`** (no `netbot.diktya.cl`, nombre viejo). Detrás de
un Caddy de borde: `/api/*` (prefijo sacado) → backend, resto → un segundo Caddy interno que
sirve el build estático del frontend. Sin CORS en producción (mismo origen). **Único puerto
publicado en la VM: 443** — ni Postgres, ni Redis, ni backend/workers, ni el frontend salen del
Docker interno. El nombre se resuelve **en local** vía *host override* en el Unbound de los cores
(`argos.diktya.cl → 10.100.25.240`) — pendiente de crear (ver
[[ARGOS Arquitectura y Entrega 2026-08-10]]), no depende de DNS público para resolver en el
recinto.

TLS real vía **DNS-01 de Cloudflare** (dominio `diktya.cl`) — no requiere que la máquina sea
alcanzable públicamente, solo control del DNS. Evita el warning de certificado autofirmado.

**Objeción de Lucas (2026-08-07) — resuelta en la entrega del 2026-08-10**: la renovación del
certificado sí depende de salir a Cloudflare, y eso no puede pasar en el recinto sin WAN. Resuelto
por diseño, no descartando Cloudflare: **el certificado se emite/renueva desde la oficina** (hay
WAN ahí), dura 90 días, y **Caddy nunca debe intentar emitir/renovar estando en el recinto** — si
la renovación falla, sigue sirviendo con el certificado vigente en vez de negarse a arrancar. Es
una de las cinco reglas duras de "opera sin WAN" — **hoy sin implementar** (Caddy no está
levantado en la VM todavía).

## Artefactos (en el repo)

- `docker-compose.prod.yml` — 9 servicios: Postgres, Redis, backend, los 5 workers
  (`worker-monitor`/`triage`/`remediation`/`ticket-followup`/`autoremediate`, mismo imagen,
  `command:` distinto), frontend, Caddy de borde.
- `apps/backend/Dockerfile`, `apps/frontend/Dockerfile` (+ `deploy.Caddyfile` interno),
  `deploy/Dockerfile` (+ `Caddyfile` de borde, compilado con `xcaddy` para el módulo DNS de
  Cloudflare).
- `apps/backend/prisma/createUser.ts` — no había forma de crear un usuario real fuera del seed de
  desarrollo (`*.dev.local`, password documentada) — script CLI nuevo, pide la contraseña por
  stdin (`pnpm user:create --email ... --role ...`).
- `.env.production.example`, `DEPLOY.md` (runbook paso a paso completo).
- `docker-compose.prod.local-test.yml` — override para probar este mismo stack en una laptop de
  desarrollo sin Caddy/TLS (publica puertos directo), usado para toda la validación de abajo.

## Validado en local (2026-08-03), no en la máquina real todavía

Corrido de punta a punta con `docker-compose.prod.local-test.yml`: migraciones (`prisma migrate
deploy`), creación de un usuario real ADMIN vía `createUser.ts`, login real completo incluido el
setup de 2FA obligatorio, `worker-monitor` escribiendo `NodeStatusEvent`, `worker-triage`
detectando un nodo caído y generando un ticket real (pipeline autónomo end-to-end), y — apuntado a
`UNIFI_MODE=live` con la misma API key ya validada — sincronizado contra el UDM real (7
dispositivos).

### Bugs reales encontrados en el camino (ya corregidos)

1. **Colisión de nombre de proyecto de Compose**: levantar el stack de prueba sin `-p` reemplazó
   los contenedores de Postgres/Redis de *desarrollo* (mismo nombre derivado del directorio del
   repo). Los datos no se perdieron (volúmenes separados por nombre), pero fue un susto real —
   siempre usar `-p <nombre-aislado>` para pruebas locales.
2. **`DATABASE_URL`/credenciales de Postgres/Caddy armadas por interpolación `${VAR}` de
   Compose**: se rompe en silencio (credenciales vacías) si no se pasa `--env-file` en *cada*
   comando. Corregido: todo el `docker-compose.prod.yml` depende solo de `env_file:
   .env.production` por servicio, cero interpolación a nivel de Compose.
3. **Orden del runbook**: levantar backend/workers antes de migrar da un arranque con errores
   transitorios (`P2021`, tabla inexistente) — no es grave (BullMQ reintenta solo, se cura en el
   siguiente poll de 30s) pero no es prolijo. `DEPLOY.md` corregido: migrar primero.
4. **`UNIFI_OS_VERIFY_TLS=false` como texto literal se evalúa `true`** — el schema de env
   (`config/env.ts`) usa `z.coerce.boolean()`, que trata *cualquier* string no vacío como
   verdadero, incluida la palabra `"false"`. La única forma de que quede en `false` es no setear
   la variable (cae al default del schema). Causó un `DEPTH_ZERO_SELF_SIGNED_CERT` real contra el
   UDM (certificado self-signed) hasta encontrarlo. `.env.production.example` corregido, con el
   gotcha documentado inline para que nadie más caiga.
5. **Build sin `tsconfig.base.json`**: los `Dockerfile` no copiaban ese archivo (todos los
   `tsconfig.json` del monorepo lo extienden) — `tsc` fallaba con `TS5083`. Corregido antes de
   llegar a nada de lo anterior.

## Ver también

- [[ARGOS Arquitectura y Entrega 2026-08-10]] — la VM real, sus specs, y las reglas duras de "opera sin WAN"
- `DEPLOY.md` (repo, raíz) — runbook completo paso a paso (**desactualizado**: sigue describiendo el host viejo, hay que revisarlo contra la VM real antes de usarlo).
- `SECURITY.md` (repo, raíz) — checklist de auditoría/secretos antes de producción.
- [[Proyecto Atlas]] — el resto del software.
- [[Infraestructura Real]] — el milestone de seguridad que gatea operar un evento real.
