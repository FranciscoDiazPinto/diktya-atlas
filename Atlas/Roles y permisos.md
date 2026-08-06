---
tags: [atlas, netbot, roles, seguridad]
updated: 2026-08-06
---

# Roles y permisos

Módulo de [[Proyecto Atlas]] — matriz completa también en `SECURITY.md` del repo.

## Los 3 roles

- **VISUALIZADOR**: solo lectura en todo — red, tickets, planos, chat de consulta. No puede
  cargar CSV, colocar APs, crear tickets ni acceder a `/infra`.
- **TECNICO**: suma escritura operativa — proponer/reservar/aplicar VLANs, crear tickets,
  colocar APs, notificar técnicos.
- **ADMIN**: todo lo anterior + escalar tickets + `/infra` (OPNsense/UniFi, ver
  [[OPNsense y UniFi]]).

## Dónde se aplica el filtro

Dos capas, nunca solo una:

1. **Tools del LLM** (`toolsByRole`, ver [[LLM y tools]]) — el modelo ni siquiera ve las tools
   que su rol no puede usar. Si igual las pidiera, `executor.ts` revalida server-side y lo
   rechaza, registrando el intento en el audit log.
2. **Rutas backend** (`requireRole`) — cada escritura (`vlan/reserve`, `vlan/apply`,
   `csv/upload`, creación de venues/eventos/zonas, `POST /tickets`, `/opnsense/status`) exige el
   rol correspondiente. Las lecturas quedan abiertas a los 3 roles.
3. **Rutas frontend** — la mayoría de las vistas ocultan botones de escritura para
   VISUALIZADOR, pero el backend es quien manda (ocultar un botón no es la barrera real). La
   única ruta bloqueada a nivel de *navegación* (no solo botón) es `/infra`, solo Admin — se
   agregó ese bloqueo explícito porque fue la primera vista con contenido sensible de verdad
   (infraestructura core, no el despliegue de un evento).

Auditoría realizada 2026-07-28: no se encontraron gaps de seguridad reales en el backend — la
única falta era el bloqueo de ruta a nivel frontend, ya corregido para `/infra`.

## Auth

JWT de acceso (15 min, en memoria de React, nunca en localStorage) + refresh token opaco
rotado (cookie httpOnly/secure/sameSite=strict, reutilización revoca todas las sesiones) + TOTP
2FA obligatorio para ADMIN/TECNICO (VISUALIZADOR exento). Fallback de dev por headers
(`x-role`/`x-user-id`), forzado a `false` si `NODE_ENV=production` sin importar la config —
nunca debe ser alcanzable en producción.

**Bug real encontrado y corregido (2026-08-05)**: `AuthContext` solo llamaba `POST /auth/refresh`
una vez, al montar la app — ninguna sesión dejada abierta más de los 15 min del access token se
recuperaba sola, todo devolvía 401 sin fin (confirmado en los logs reales del stack
`netbot-prodtest-*`: una ráfaga de una docena de `/network/status` fallando 401 en la misma
milésima de segundo). Ahora `AuthContext` renueva proactivamente 1 min antes de esos 15 min
(después de cada login/2FA/refresh exitoso), y `apiClient.ts` reintenta una vez cualquier request
que reciba 401, pidiendo un token fresco antes de reintentar. Ambos caminos comparten el mismo
refresh deduplicado (`refreshInFlightRef`) para que varias requests golpeadas por un 401 al mismo
tiempo no manden el refresh token dos veces — reusarlo se trata como robo de sesión y revoca
todas las sesiones del usuario.

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[LLM y tools]] — filtro de tools por rol en detalle
- [[OPNsense y UniFi]] — la vista que sí bloquea por rol a nivel de ruta
