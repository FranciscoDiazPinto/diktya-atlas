---
tags: [atlas, netbot, llm, tools]
updated: 2026-07-29
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

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[Mapeo de planos y cobertura]] — las tools de cobertura en detalle
- [[Roles y permisos]] — filtro de tools por rol
