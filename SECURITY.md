# Seguridad — NetBot / Diktya Atlas

Este documento cubre los deliverables del prompt de seguridad: matriz de
permisos, estrategia de despliegue, y checklist de auditoría/secretos antes
de producción. El modelo de auth (JWT + refresh rotation + 2FA TOTP) está
implementado en `apps/backend/src/auth/` — ver ese código para el detalle
técnico; acá va el resumen operativo.

## Matriz de permisos (rol × acción)

| Acción | Admin | Técnico | Visualizador |
|---|---|---|---|
| Ver dashboard/estado de red (`GET /network/*`) | ✅ | ✅ | ✅ |
| Ver tickets (`GET /tickets*`) | ✅ | ✅ | ✅ (solo lectura) |
| Chatear con el agente (`POST /chat`) | ✅ | ✅ | ✅ (tools limitadas — ver abajo) |
| Cargar CSV / proponer plan de VLAN (`POST /csv/upload`) | ✅ | ✅ | ❌ |
| Reservar VLAN (`POST /vlan/reserve`) | ✅ | ✅ | ❌ |
| Aplicar cambios de red (`POST /vlan/apply`) | ✅ | ✅ | ❌ |
| Resolver/reabrir tickets (`POST /tickets/:id/resolve|reopen`) | ✅ | ✅ | ❌ |
| Escalar un ticket (tool `escalate_ticket`, vía chat) | ✅ | ❌ | ❌ |
| Pausar/reconfigurar auto-remediación | ✅ | ❌ | ❌ |
| Ver auditoría completa | ✅ | ❌ (solo la propia, a futuro) | ❌ |
| Gestionar usuarios/roles | ✅ | ❌ | ❌ (UI no implementada aún — ver "Pendientes") |

Esta tabla es la fuente de verdad para dos mecanismos independientes que
deben coincidir (defensa en profundidad):
- `apps/backend/src/auth/middleware.ts` (`requireRole`) — bloquea a nivel HTTP.
- `packages/shared/src/tools.ts` (`toolsByRole`) — filtra qué tools ve el LLM
  *antes* de la llamada, y `llm/tools/executor.ts` revalida server-side.

## Modelo de autenticación (resumen)

- Password: argon2id (`@node-rs/argon2`).
- Access token: JWT, 15 min, en `Authorization: Bearer`. Nunca en cookie ni
  en `localStorage` del frontend (vive solo en memoria — mitiga robo por XSS).
- Refresh token: opaco, cookie `httpOnly`+`secure`(prod)+`sameSite=strict`,
  scope `path=/auth`. Rotación en cada uso; **reuso de un token ya rotado
  revoca todas las sesiones del usuario** (señal de robo de sesión).
- 2FA (TOTP, `otplib`): **obligatorio** para Admin y Técnico — no pueden
  loguear sin configurarlo (el login los manda por el flujo de setup la
  primera vez). Visualizador no lo necesita (solo lectura).
- Rate limit propio en `/auth/login` y `/auth/login/verify-totp` (10/min por IP).

## Estrategia de despliegue

El sistema corre en la red local del cliente/evento pero necesita que la
dirección real del servidor no quede expuesta. Dos opciones evaluadas:

### Recomendado por default: VPN de malla (ZeroTier)

Para uso exclusivo del equipo técnico (que es el caso hoy: Admin/Técnico
necesitan acceso, Visualizador todavía no tiene un caso de uso externo real).

**Actualizado 2026-08-03**: se decidió ZeroTier en vez de Tailscale (la
recomendación original de este documento) — ZeroTier ya está desplegado y
en uso real hoy mismo, es el mismo camino que usa este equipo para llegar a
OPNsense/UniFi (ver `Atlas/Rutas de Red.md`), así que se suma NetBot a esa
misma red en vez de introducir una herramienta nueva sin necesidad.

- Cada máquina del equipo (y la máquina que corre NetBot) se une a la red
  ZeroTier `diktya-atlas-mgmt` (id `76fc96e498382f09`) — autorizado por
  quien administra esa red en ZeroTier Central. El backend nunca expone un
  puerto al router/internet.
- El backend + Postgres + Redis + workers quedan en la máquina dedicada que
  corre `docker compose -f docker-compose.prod.yml` (ver `DEPLOY.md`),
  alcanzable solo por su IP de ZeroTier dentro de esa red privada — ningún
  servicio interno publica puerto al host salvo Caddy (80/443).
- TLS: como ZeroTier no emite certificados propios (a diferencia de
  Tailscale), se usa Caddy con desafío **DNS-01 vía Cloudflare** (dominio
  `diktya.cl`) — no requiere que la máquina sea alcanzable públicamente,
  solo control del DNS, y evita el warning de certificado autofirmado.
- Pasos y artefactos concretos: ver `DEPLOY.md` (runbook completo) y
  `docker-compose.prod.yml` / `deploy/Caddyfile`.

**Ventaja**: cero superficie pública, reusa infraestructura ya operativa
(no depende de adoptar ni aprender una herramienta nueva), y el control de
acceso es a nivel de red, no solo de aplicación.

### Solo si aparece un caso de uso externo real: Cloudflare Tunnel

Si en algún momento el rol Visualizador necesita acceder al dashboard
resumido desde fuera de la VPN (ej. un cliente externo sin Tailscale
instalado), reservar esta opción — **nunca exponer sin la capa de auth de
aplicación ya activa**, el túnel no reemplaza el login:

- `cloudflared tunnel create netbot-dashboard`, DNS `dashboard.diktya.cl`
  apuntando al túnel (TLS gratis, protección DDoS básica de Cloudflare).
- Regla de ingress apuntando solo a las rutas de solo-lectura (o todo el
  backend, pero confiando en que el 403 de `requireRole` sigue aplicando).
- Cloudflare Access opcionalmente agrega una capa extra de auth (SSO/email
  OTP) *antes* de que la request llegue al backend — recomendado si se usa
  esta opción, como defensa adicional a la sesión JWT propia.

### Por qué no ambas por default

Mantener las dos superficies (túnel público + VPN) duplica lo que hay que
asegurar y auditar sin necesidad real todavía. Empezar con VPN de malla; si
aparece el caso de uso externo, sumar el túnel *acotado* a esas rutas
específicas, no reabrir todo el backend.

## Checklist de auditoría y secretos antes de producción

**Ver `.env.production.example` y `DEPLOY.md`** — cubren en concreto cada
punto de esta lista (plantilla + runbook), esto queda como el resumen.

- [ ] `JWT_SECRET` generado con `openssl rand -hex 32` (o más), distinto en
      cada ambiente, nunca commiteado (`.env`/`.env.production` están en
      `.gitignore`).
- [ ] `ALLOW_DEV_ROLE_HEADER` en `false` — se fuerza solo automáticamente
      cuando `NODE_ENV=production` (ver `config/env.ts`); confirmar que el
      deploy real setea esa variable.
- [ ] `DATABASE_URL`/`REDIS_URL` con credenciales rotables, no las de
      desarrollo local del `docker-compose.yml`.
- [ ] Los 3 usuarios `*.dev.local` sembrados por `prisma/seed.ts`
      (password `NetBotDev123!`) **no se llevan a producción** — usar
      `pnpm --filter backend user:create` (`apps/backend/prisma/createUser.ts`)
      para las cuentas reales del equipo en su lugar.
- [ ] Cookie de refresh con `secure=true` (se activa solo si
      `NODE_ENV=production`, confirmar que el proxy/túnel termina TLS antes
      del backend para que la cookie efectivamente viaje sobre HTTPS).
- [ ] Revisar `AuditLog` periódicamente: cada login/logout, cada acción de
      red aplicada, cada 403 por rol, y cada tool invocada por el LLM queda
      ahí con actor/worker/parámetros/resultado — es el rastro que se pide
      poder auditar ante un incidente.
- [ ] API keys de LLM (OpenRouter/Anthropic/OpenAI) y credenciales de
      UniFi/OPNsense/Proxmox: solo en variables de entorno del proceso, en
      un vault o `.env` fuera de control de versiones — nunca impresas en
      logs (revisar que ningún `console.log`/log de Fastify termine
      volcando `process.env` completo).
- [ ] Rate limit de `/auth/login` usa store en memoria por proceso hoy — si
      se corre el backend con más de una réplica, cambiar a un store
      compartido (Redis, ya está en el stack) para que el límite sea real
      entre instancias.

## Pendientes explícitos (fuera de alcance de esta pasada)

- UI de gestión de usuarios/roles para Admin (el permiso ya existe en la
  matriz, falta la pantalla).
- Autenticación del WebSocket (`GET /ws`) — hoy cualquiera que llegue a la
  red donde corre el backend puede conectarse y recibir eventos de
  estado/alertas/tickets en tiempo real. No es información ultra sensible
  (no incluye credenciales ni IPs), pero antes de exponerlo más allá de la
  VPN del equipo, hay que resolver auth de WS (los navegadores no pueden
  mandar headers custom en el handshake — la vía típica es un token de
  corta vida por query param, validado y descartado al conectar).
