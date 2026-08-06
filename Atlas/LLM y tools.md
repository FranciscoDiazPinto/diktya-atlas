---
tags: [atlas, netbot, llm, tools]
updated: 2026-08-06
---

# LLM y tools

Módulo de [[Proyecto Atlas]] — orquestador conversacional detrás de la vista `/chat`.

## Loop multi-paso

El endpoint `/chat` hace un **loop de tool-calling multi-paso** (tope de 6 rondas, la última
forzada sin tools para garantizar respuesta final en texto): el LLM puede encadenar varias tools
en un mismo turno — ej. resolver "Expomin 2026" → `list_events` → `list_event_zones` →
`get_coverage_at_point` — sin que el usuario tenga que darle IDs.

Antes de esto (hasta 2026-07-28), el endpoint hacía exactamente **una** ronda de tool-calling y
devolvía lo que viniera — si el LLM necesitaba dos pasos para responder, el segundo nunca pasaba
y quedaba con mensaje vacío. Se corrigió extendiendo `LlmMessage` con `toolCalls` para poder
reproducir correctamente el turno del asistente hacia cada proveedor (OpenRouter/OpenAI-compatible/
Anthropic tienen formatos de wire distintos para esto).

## Memoria conversacional real

El frontend reenvía el historial visible (`ChatContext`, persistido en localStorage —
sobrevive a refresh y cambio de vista) como `history` en cada request, tope de 20 turnos. Sin
esto, aunque el historial se viera en pantalla, el backend no tenía memoria real — cada mensaje
nuevo era un turno aislado para el LLM, y preguntas de seguimiento ("¿y cuál de esas dos...?")
no podían resolver el pronombre.

## Tools disponibles (`packages/shared/src/tools.ts`)

- `get_network_status`, `get_ap_detail` — lectura
- `diagnose_node` — fuerza una consulta en vivo a UniFi para un nodo puntual (ADMIN/TECNICO,
  mismo criterio de rol que el REST `/network/nodes/:id/diagnose` — dispara tráfico real, no es
  un GET de caché)
- `get_node_history` — timeline de un nodo (cambios de estado + alertas + tickets), ADMIN/TECNICO
- `propose_vlan_plan` — genera un diff, no escribe nada
- `reserve_vlan` — reserva (no aplica)
- `apply_vlan_plan` — encola la escritura real en el worker
- `create_ticket`, `escalate_ticket`, `notify_technicians`
- `list_events`, `list_event_zones` — resolución de nombres a IDs
- `get_coverage_at_point`, `find_coverage_gaps`, `place_ap` — mapeo de planos, ver
  [[Mapeo de planos y cobertura]]

Filtro por rol (`toolsByRole`, ver [[Roles y permisos]]): VISUALIZADOR solo tiene las de lectura
+ mapeo; TECNICO suma tickets/VLAN/notificaciones; ADMIN suma `escalate_ticket`. El filtrado
pasa en dos capas — el LLM ni ve las tools que su rol no puede usar, y el backend revalida el
rol server-side igual (`executor.ts`), por si el LLM insistiera igual.

## Proveedor LLM

Intercambiable: OpenRouter / Anthropic / OpenAI-compatible, sin tocar el resto del código —
pensado para poder pasar a un modelo local en producción sin reescribir el orquestador. Ver
[[Proyecto Atlas]] para la decisión pendiente de hardware/modelo local.

## Gap conocido: propose→reserve→apply de VLAN se puede encadenar sin pasar por la UI de confirmación (2026-08-06)

`PlanDiffCard.tsx` (comentario: *"Nunca un botón único aplicar todo"*) es la UI pensada para que
reservar y aplicar una VLAN sean dos clicks explícitos y separados, por fila — pero esa tarjeta
**solo está conectada al flujo de subir un CSV** (`ChatView.tsx::handleCsvResult`), no al
resultado de la tool `propose_vlan_plan` cuando la invoca el chat.

Como `propose_vlan_plan`, `reserve_vlan` y `apply_vlan_plan` son las tres tools de chat
disponibles para TECNICO/ADMIN, y el orquestador encadena hasta 6 llamadas por turno según lo
que el modelo decida (ver "Loop multi-paso" arriba), un usuario que le pida al chat algo como
"aplicá este cambio de VLAN ya" puede terminar, en un solo turno, con una escritura real contra
UniFi (`UNIFI_MODE=live` activo) sin que la tarjeta de confirmación aparezca nunca — solo se ven
los badges verdes de cada tool en el mensaje. Lo único que hoy lo evita es una instrucción en el
system prompt (`chat.ts::buildSystemPrompt`: *"apply_vlan_plan encola el trabajo real, no lo
ejecutá vos"*), no un bloqueo técnico.

**Cómo cerrarlo** (no implementado, pendiente de decisión): sacar `reserve_vlan`/`apply_vlan_plan`
de las tools de chat y forzar ese flujo solo por CSV+UI, o agregar un gate server-side en
`executor.ts` que exija una confirmación humana explícita (ej. un token de un solo uso emitido
al mostrar el diff) antes de ejecutar `apply_vlan_plan`, sin importar si vino de UI o del LLM.

## Backlog: tools de diagnóstico/error-control para TECNICO/ADMIN (candidatas, 2026-08-06)

Surgió de la pregunta "qué más ayudaría a técnico/admin con problemas de red desde el chat".
Ninguna de estas escribe contra UniFi/OPNsense ni depende de tener el cliente OPNsense real
conectado (ver [[project_atlas_vlans_and_opnsense_next]] en memoria) — todas leen datos que el
backend ya calcula, solo falta exponerlas.

- [x] **`diagnose_node`** (2026-08-06) — envuelve `network.service.ts::diagnoseNode` (ya existía
  como REST). Tests: `test/toolRegistry.test.ts`.
- [x] **`get_node_history`** (2026-08-06) — nuevo `services/nodeHistory.service.ts`, cruza
  `Alert` + `Ticket` + `NodeStatusEvent` por `nodeId` en un timeline ordenado desc, `limit`
  aplicado por categoría antes de mezclar. Cada intento de auto-remediación ya queda narrado
  paso a paso en la descripción del ticket que genera (`autoRemediation.service.ts`, variable
  `resumen` + `"Pasos: reset enviado → volvió online..."`), pero antes solo se veía entrando al
  ticket individual. Tests: `test/nodeHistory.service.test.ts`, `test/toolRegistry.test.ts`.
- [ ] **`get_activity_digest`** — envolver el reporte que ya existe entero (`GET /reports/digest`,
  UI en `/red` § Actividad: alertas/tickets/tiempos de resolución/reservas VLAN por rango de
  fechas). Es wiring puro, sin lógica nueva.
- [ ] **`get_availability`** — envolver `nodeAvailability.service.ts` (alimenta el dashboard de
  disponibilidad: % online, historial de conexión, histograma de outages). Responde "¿este AP
  viene fallando seguido o fue aislado?" antes de escalar a alguien en terreno.
- [ ] **`list_open_issues`** — no existe como tool (sí como vistas en `/red`/`/tickets`). Combinar
  `Alert` + `Ticket` filtrando `estado != RESUELTO`, opcionalmente por sitio/severidad — pensada
  como lo primero que pregunta un técnico entrando a un turno.
- [ ] **`assign_ticket`** — hallazgo: el schema ya tiene `Ticket.asignadoAId` (con relación
  `User "TicketAssignee"`) pero nada lo usa — ni service, ni ruta, ni tool. Campo muerto, mismo
  patrón que la tabla `WifiNetwork` (ver [[project_atlas_vlans_and_opnsense_next]] en memoria).
  Agregar `assign_ticket(ticketId, userId)` daría trazabilidad real de "quién se está haciendo
  cargo" de un incidente.

De las cuatro restantes, `get_activity_digest` y `get_availability` son básicamente conectar un
cable (el service ya calcula todo, falta el tool wrapper + schema Zod + entrada en
`toolsByRole`) — `list_open_issues` y `assign_ticket` son lógica nueva pero chica.

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[Mapeo de planos y cobertura]] — las tools de cobertura en detalle
- [[Roles y permisos]] — filtro de tools por rol
