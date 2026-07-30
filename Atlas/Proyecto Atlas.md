---
tags: [atlas, netbot, documentacion]
updated: 2026-07-30
---

# Diktya Atlas — NetBot

Agente conversacional que automatiza la gestión de redes de eventos (UniFi + OPNsense),
orquestado por un LLM. Pensado como el "agente de terreno" para la infraestructura real de
despliegues móviles de Diktya (eventos con conectividad temporal vía Starlink/WAN de respaldo) —
ver [[Infraestructura Real]] y [[Rutas de Red]] para esa parte (no es software, es la operación
real que este proyecto va a terminar automatizando).

Repo: https://github.com/FranciscoDiazPinto/diktya-atlas

## Stack

**Monorepo pnpm** (`apps/backend`, `apps/frontend`, `packages/shared`), Node 24.

- **Backend**: Fastify 5 + Prisma 6/Postgres + BullMQ/Redis + Zod. Auth real (JWT + refresh
  rotation + TOTP 2FA).
- **Frontend**: React 19 + Vite + Tailwind v4, TanStack Query, WebSocket realtime.
- **LLM**: proveedor intercambiable (OpenRouter / Anthropic / OpenAI-compatible) — pensado para
  poder pasar a un modelo local en producción sin tocar el resto del código, ver
  [[LLM y tools]].

## Arquitectura de seguridad (lo no negociable)

Todo el diseño gira en torno a **nunca escribir directo sobre infraestructura real**:

1. **Reserva, no escritura** — VLANs se *reservan* (constraint único en DB por
   `vlanId+sitio+estado`, devuelve 409 si hay conflicto) antes de aplicarse.
2. **Lock distribuido** (Redlock) antes de cualquier escritura real.
3. **Detección de doble escritura** — se compara un snapshot base contra el estado remoto antes
   de escribir.
4. **Verificación post-escritura + rollback automático**.
5. **Audit log completo** — cada acción de cada worker/tool queda registrada (quién, qué
   parámetros, resultado), incluso si falla o si el rol no estaba autorizado.
6. **Filtrado de tools por rol en dos capas** — el LLM ni siquiera *ve* las tools que su rol no
   puede usar (`toolsByRole`), y el backend revalida el rol server-side igual, por si acaso.

El LLM **nunca ejecuta código arbitrario**: solo puede invocar tools predefinidas con schema Zod;
`apply_vlan_plan` encola el trabajo real en un worker, no lo ejecuta el orquestador de chat.

Ver [[Roles y permisos]] y `SECURITY.md` en el repo para la matriz completa.

## Módulos / vistas del frontend

| Vista | Ruta | Quién la ve | Qué hace |
|---|---|---|---|
| Chat | `/chat` | Todos | Orquestador conversacional, ver [[LLM y tools]] |
| Red | `/red` | Todos | Estado UniFi: nodos, alertas, detalle de AP |
| Tickets | `/tickets` | Todos (crear: Admin/Técnico) | Incidentes, resolución/reapertura |
| Planos | `/planos` | Todos (editar: Admin/Técnico) | Mapeo de cobertura, ver [[Mapeo de planos y cobertura]] |
| Infraestructura | `/infra` | Solo Admin | Estado OPNsense/UniFi + "solicitar cambio", ver [[OPNsense y UniFi]] |

Nav en sidebar colapsable (persiste preferencia en localStorage).

## [[LLM y tools]]

Orquestador de `/chat`: loop de tool-calling multi-paso (encadena varias tools en un turno, ej.
resolver nombre de evento → zona → cobertura) + memoria conversacional real (historial reenviado
en cada request). 13 tools filtradas por rol. Detalle completo → ver la nota dedicada.

## [[Mapeo de planos y cobertura]]

Un evento (`EventDeployment`, ej. "Expomin 2026") puede tener varias zonas (`EventZone`) —
pabellones, estacionamientos — cada una con su propio plano y calibración de escala,
independiente entre zonas. APs colocados por click dan cobertura geométrica (sin señal real
todavía). Detalle completo, modelo de datos y el diseño futuro de detección de stands por
visión → ver la nota dedicada.

## [[OPNsense y UniFi]]

Panel `/infra` (solo Admin): UniFi lee de Postgres (sync), OPNsense corre contra un mock nuevo
(`MockOpnsenseClient`) ya que el cliente real seguía sin implementar. "Solicitar cambio" crea un
ticket, no escribe nada directo. Detalle completo, incluida la reachability real de cada uno →
ver la nota dedicada.

## [[Roles y permisos]]

Tres roles (`ADMIN`, `TECNICO`, `VISUALIZADOR`), filtrados en dos capas (tools del LLM + rutas
backend), auth real con JWT+refresh+TOTP 2FA. Matriz completa y detalle de auth → ver la nota
dedicada.

## Estado actual / pendientes conocidos

- Cliente OPNsense real: no implementado (mock funcional, ver [[OPNsense y UniFi]]).
- Gestión de usuarios/roles desde el panel Admin: no implementada.
- Auth del WebSocket de tiempo real: pendiente.
- QR real para enrolamiento de 2FA: pendiente (hoy se muestra el secreto en texto).
- LLM en producción: el cliente pidió que sea **local**, no cloud — evaluando hardware
  (candidato: Mac Mini M4 Pro con suficiente RAM unificada; modelo recomendado: Qwen2.5
  14B/32B-Instruct por tool-calling nativo confiable en español).
- Detección de stands por visión: diseñado, no implementado (ver [[Detección de stands por vision]]).
- **UniFi WLANs/nodos/reboot: migrados a la Integration API real y validados contra hardware real
  (2026-07-30)** — ver [[OPNsense y UniFi]]. `UNIFI_MODE` sigue en `mock` — pendiente pasar a
  `live` cuando se llegue al milestone de revisión de seguridad (ver [[Infraestructura Real]]).
- **Notificaciones Telegram: corregidas y probadas en real (2026-07-30)** — tenían un bug real
  (chat_id hardcodeado a un placeholder). Ahora requiere `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` juntas.
- **Auto-remediación por criticidad: diseño conceptual, sin implementar** (ej. AP offline → NetBot
  intenta resetear/re-adoptar antes de escalar a técnico) — ver [[Plataforma ATLAS (Codex)]] §
  Decisión, incluye qué falta construir.
- Existe una plataforma separada e independiente ("ATLAS", de Codex) operando sobre la misma
  infraestructura real — **no relacionada con este software**, ver
  [[Plataforma ATLAS (Codex)]] antes de asumir que algo de observabilidad/alertas ya está resuelto
  por otro lado.

## Convenciones del repo

- Node 24 vía nvm — el Node del sistema es v18, insuficiente (`source ~/.nvm/nvm.sh && nvm use 24`
  antes de cualquier comando `pnpm`).
- Commits separados por feature, no todo junto — ver historial de `git log` como referencia de
  estilo.
- `pnpm -r lint` (typecheck) y `pnpm --filter backend test` / `pnpm --filter frontend test` antes
  de dar algo por terminado.
