---
tags: [atlas, netbot, documentacion]
updated: 2026-07-31
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
| Infraestructura | `/infra` | Solo Admin | Estado OPNsense/UniFi + dashboard de disponibilidad + "solicitar cambio", ver [[OPNsense y UniFi]] |

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
  (2026-07-30)** — ver [[OPNsense y UniFi]].
- **`UNIFI_MODE=live` está ACTIVO desde la noche del 2026-07-30** (antes era `mock`, ver
  [[OPNsense y UniFi]]) — `/red` muestra los 7 dispositivos reales (los 2 nodos mock de demo se
  borraron de Postgres). Reboot real y escritura real de VLAN (`DIKTYA-MNG`) quedan habilitados
  si algo los dispara — sin milestone de revisión de seguridad todavía, decisión explícita del
  usuario de avanzar igual para pruebas. Backend corriendo en background al cierre de la sesión
  — confirmar al retomar si sigue arriba o hay que levantarlo de nuevo.
- **Tipo de dispositivo (AP/Switch/Gateway/UPS) con íconos en `/red` (2026-07-30)** — campo real
  `tipoDispositivo`, clasificado server-side desde `features` de la Integration API + casos
  especiales por nombre de modelo (UPS y el gateway real no traen el feature esperado).
- **Reporte de actividad (`GET /reports/digest`) agregado (2026-07-30), con sección "Actividad"
  en `/red` desde el 2026-07-31** — alertas/tickets (+tiempo de resolución)/auditoría/reservas
  VLAN por rango de fechas (Hoy/Ayer/Últimos 7 días), stat tiles + tabla de auditoría por worker.
- **Auto-remediación: notifica también en éxito si el corte fue largo (2026-07-31)** —
  antes solo avisaba por Telegram al escalar (reset + re-adopción fallidos); un corte que se
  autoresolvía justo antes de actuar quedaba con la misma visibilidad cero que un blip de 90s.
  Nuevo `AUTO_REMEDIATE_NOTIFY_THRESHOLD_MINUTES` (default 5): si la duración total offline llega
  al umbral, notifica igual aunque el reset haya funcionado (ADVERTENCIA, "resuelto, sin acción
  necesaria" en vez de problema en curso). Bajo el umbral, el ticket INFO sigue quedando como
  registro completo, solo que sin avisar a nadie.
- **Doc interactiva de la API (Swagger UI) en `/docs`, agregada 2026-07-31** — `@fastify/swagger` +
  `@fastify/swagger-ui`, reusando los mismos schemas Zod que cada ruta ya usaba para `.parse()` a
  mano (convertidos con `zod-to-json-schema`, ya era dependencia). No cambia la validación en
  runtime: cada ruta documentada lleva `attachValidation: true`, así que Fastify nunca corta la
  request con su propio formato de error — el `.parse()` manual en el handler sigue siendo la
  única fuente de verdad. Sin schemas de respuesta a propósito (evita el riesgo de que el
  serializer de Fastify recorte campos reales de la respuesta si el schema no calza exacto con
  ~40 endpoints). Solo montada cuando `NODE_ENV !== "production"`.
- **Dashboard de disponibilidad en `/infra` (solo Admin), agregado 2026-07-31** — nuevo modelo
  `NodeStatusEvent` (un registro por cambio de estado real, no por poll), a partir del cual se
  calcula % de disponibilidad por nodo/promedio, serie temporal de "historial de conexión" e
  histograma de duración de cortes (`GET /reports/availability`, gateado
  `requireRole("ADMIN")` igual que `/opnsense/status`). Resuelve la limitación anterior (uptime
  real no existía, `NetworkNode` solo guardaba el estado actual). "Sin datos" se distingue de 0%
  explícitamente para los tramos anteriores al primer evento conocido de un nodo. Velocidad de
  internet quedó deliberadamente afuera — no hay integración OPNsense real ni mecanismo de
  speedtest, decisión explícita del usuario de no construir sobre una base inexistente. Sin
  librería de gráficos en el frontend: los charts (línea/área e histograma) son SVG a mano
  siguiendo la skill de dataviz del repo. Se hizo backfill manual de un evento baseline para los 7
  nodos ya existentes en Postgres (si no, quedaban en "sin datos" hasta su primer cambio de estado
  real tras el deploy).
- **Notificaciones Telegram: corregidas y probadas en real (2026-07-30)** — tenían un bug real
  (chat_id hardcodeado a un placeholder). Ahora requiere `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` juntas.
- **Auto-remediación por criticidad — implementada 2026-07-31** — ver [[Plataforma ATLAS (Codex)]]
  § Decisión para el detalle completo. Reset + re-adopción para APs offline antes de escalar a
  técnico; re-adopción sin validar contra hardware real. `worker-autoremediate` no arranca solo.
- **Suite de tests aislada de la infra real (2026-07-30/31)**: base `netbot_test` + Redis índice
  `/1` separados — antes cada `vitest run` insertaba datos de prueba en la base real y contaminaba
  los reportes. `pnpm --filter backend db:test:setup` antes de correr tests por primera vez.
- Investigada la respuesta rara del chat sobre estado de red (2026-07-30 noche) — confirmado por
  el usuario el 2026-07-31: era un problema de redacción del LLM, no de alcance/datos de la tool.
  Sin acción pendiente.
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
