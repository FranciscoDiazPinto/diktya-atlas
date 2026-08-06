---
tags: [atlas, netbot, documentacion]
updated: 2026-08-06
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

- Cliente OPNsense real: no implementado (mock funcional, ver [[OPNsense y UniFi]]) — **próximo
  paso acordado con el usuario** (2026-08-03): conectarlo real con restricción de roles
  admin/técnico.
- Gestión de usuarios/roles desde el panel Admin: sigue sin UI, pero desde 2026-08-03 hay un
  script CLI (`apps/backend/prisma/createUser.ts`, `pnpm user:create`) que cubre la necesidad
  inmediata de crear cuentas reales — ver [[Despliegue a Producción]].
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
  usuario de avanzar igual para pruebas.
- **`/red` reescrito: VLANs en vivo, lista mobile-first, doble confirmación (2026-08-03)** —
  el panel de VLANs pasó de leer `WifiNetwork` en Postgres (tabla que **nunca escribe nadie**,
  ni sync ni el flujo de reserva/aplicar VLAN — confirmado insertando y borrando una fila de
  prueba) a consultar UniFi en vivo (`listWifiNetworks`, misma Integration API que reboot/diagnose,
  botón "Consultar ahora" sin auto-refetch, igual que `UnifiOsRealCard`). `NodeList` ahora tiene
  variante de cards para mobile/tablet (staff de piso de feria) además de la tabla, con buscador
  por nombre. El reinicio de nodo pasó de `window.confirm()` a un diálogo real de dos pasos
  (`ConfirmDestructiveDialog`, impacto → checkbox → confirmar). Badge de frescura de datos junto
  al título de "Nodos", basado en el `updatedAt` más reciente.
- **SSIDs transmitidos ahora persistidos y mostrados reales (2026-08-04)** — `normalizeIntegrationDevice`
  ya calculaba los SSIDs que transmite cada AP, pero se descartaban antes de llegar a Postgres (no
  había columna). Nueva columna `NetworkNode.ssidsTransmitidos` (`String[]`), escrita por
  `nodeSync.service.ts::syncNode` en cada sync. `NodeDetailPanel` ("Redes WiFi (SSID)") pasó de leer
  `node.wifiNetworks` (la relación a la tabla `WifiNetwork` de Postgres, confirmada muerta — ver
  entrada de arriba sobre VLANs) a `node.ssidsTransmitidos`, así que ahora esa sección muestra datos
  reales en vez de estar siempre vacía. El backend (`network.service.ts::getApDetail`) todavía
  incluye la relación `wifiNetworks` en el include de Prisma — queda sin usar por el frontend, no se
  tocó (limpiarla es sacar la relación completa del schema, decisión aparte).
- Fix menor: `apiClient.ts` mandaba `Content-Type: application/json` en POST/PATCH sin body; ahora
  solo lo manda si hay body. `app.ts` agrega manejo explícito de `FST_ERR_CTP_EMPTY_JSON_BODY`
  (400 en vez de 500 genérico) para cualquier caller que aún mande el header sin body.
- **Dashboard: desglose de nodos por tipo real, no solo AP (2026-08-04)** — `DashboardSummaryStrip`
  contaba "APs online/offline" sobre *todos* los nodos sin filtrar por `tipoDispositivo` (switches/
  UPS/gateway se contaban como si fueran AP). Nuevo `NodesByTypeCard` desglosa por tipo real;
  `ExpandableCard` es el componente genérico de soporte para esa tarjeta.
- **Dos tools de chat nuevas para diagnóstico (2026-08-06)** — `diagnose_node` (fuerza consulta
  en vivo a UniFi para un nodo, ver [[OPNsense y UniFi]]) y `get_node_history` (timeline de
  cambios de estado + alertas + tickets de un nodo). Primeras dos del backlog en
  [[LLM y tools]] § Backlog — ADMIN/TECNICO solamente, mismo criterio que `get_ap_detail`.
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
- **Site Manager Connector como transporte alternativo de la Integration API, agregado
  2026-08-03** — `UNIFI_INTEGRATION_TRANSPORT=connector` (default sigue siendo `direct`, sin
  cambios hasta habilitarlo) pega vía `api.ui.com` en vez de directo a `UNIFI_OS_HOST`, sacando la
  dependencia del port-forward no oficial en CORE-01. `UnifiOsClient` ahora tiene constructor
  privado + factories `.direct()`/`.viaConnector()`. Nuevo `GET /site-manager/hosts` (Admin) para
  descubrir el `UNIFI_SITE_MANAGER_HOST_ID` que hace falta. Sin probar contra hardware real
  todavía (sin key de Site Manager configurada) — ver [[Rutas de Red]] § Site Manager Connector.
- **Estado de UniFi Mobility (UMR, routers móviles/de viaje) en `/infra`, agregado 2026-08-03** —
  API cloud separada (`api.ui.com`, no la Integration API de red), solo lectura. Sin
  `UNIFI_MOBILITY_API_KEY` configurada todavía — ver [[OPNsense y UniFi]] § UniFi Mobility.
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
- **Infraestructura de despliegue a producción armada (2026-08-03)** — Docker Compose + Caddy +
  ZeroTier, validada de punta a punta en local (migraciones, creación de usuario real, login con
  2FA, workers escribiendo `NodeStatusEvent`, y sincronizada contra el UDM real). Esperando a que
  el cliente provea la máquina dedicada — ver [[Despliegue a Producción]] para el detalle completo
  y el runbook.

## Convenciones del repo

- Node 24 vía nvm — el Node del sistema es v18, insuficiente (`source ~/.nvm/nvm.sh && nvm use 24`
  antes de cualquier comando `pnpm`).
- Commits separados por feature, no todo junto — ver historial de `git log` como referencia de
  estilo.
- `pnpm -r lint` (typecheck) y `pnpm --filter backend test` / `pnpm --filter frontend test` antes
  de dar algo por terminado.
