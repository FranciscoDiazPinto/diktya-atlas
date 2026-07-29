---
tags: [atlas, netbot, diseno-futuro, vision]
updated: 2026-07-29
---

# Detección de stands por visión

**Estado: propuesto, no implementado.** Diseño completo y con más detalle en
`docs/design/stand-vision-mapping.md` del repo — esta nota es el resumen para navegar rápido
desde la bóveda, la fuente de verdad es el doc del repo.

## Problema

Los planos de eventos (ej. Expomin) vienen con los stands ya dibujados: área + código de local
(ej. "B-55"). Hoy [[Mapeo de planos y cobertura]] solo modela APs/switches colocados
manualmente — no hay forma de preguntarle al chat "¿hay cobertura en el stand B-55?" sin saber
de antemano sus coordenadas.

## Idea central

El agente lee el plano **una vez** (no en cada pregunta de chat), propone dónde está cada stand,
y un humano confirma/corrige antes de que sea consultable — mismo principio que "reservar, no
escribir" que ya usa el resto del proyecto (ver [[Proyecto Atlas]]).

## Piezas nuevas

- Entidad `Stand` (código, bounding box rectangular, `estado`: `DETECTADO_AUTO` /
  `CONFIRMADO` / `EDITADO_MANUAL`).
- **`LlmProvider` necesita soporte de imágenes** — hoy solo maneja texto, ningún provider
  recibe imágenes. Cambio contenido a los payload builders, no al loop de tools.
- Detección por **tiles**, no la página completa (texto muy chico/apretado en planos de expo
  reales para una sola pasada confiable).
- `list_stands` / `get_coverage_by_stand` — mismo patrón de resolución por nombre que
  `list_events`/`list_event_zones`.

## Riesgos

- Precisión: texto chico puede confundirse (B-55 vs 8-55) → confirmación humana no es opcional.
- Costo/latencia: acción puntual por zona (botón), no algo que corra solo en cada carga o
  pregunta.

## Ver también

- [[Mapeo de planos y cobertura]] — el módulo que esto extendería
- [[Proyecto Atlas]] — LLM local pendiente de hardware, relevante para qué modelo de visión usar
