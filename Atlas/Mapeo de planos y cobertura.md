---
tags: [atlas, netbot, planos, cobertura]
updated: 2026-07-29
---

# Mapeo de planos y cobertura

Módulo de [[Proyecto Atlas]] — vista `/planos` (todos los roles ven, Admin/Técnico editan).

## Modelo de datos

Un evento (`EventDeployment`, ej. "Expomin 2026") puede tener **varias zonas** (`EventZone`) —
pabellones, estacionamientos, etc. — cada una con su propio plano (PDF/imagen) y su propia
calibración de escala (píxeles por metro), **independiente entre zonas** (verificado con test:
APs de una zona no dan cobertura en otra, aunque compartan coordenadas).

- **`Venue`** — recinto reutilizable (plano base), puede compartirse entre eventos distintos.
- **`EventZone`** — zona puntual de un evento, con override de plano opcional (si no hay
  override, usa el plano del Venue) y su propia calibración de escala.
- **`ApPlacement`** — AP/switch colocado con click en el canvas, con radio de cobertura según
  modelo:
  - `U6_MESH` — AP, radio 20m
  - `U7_CAMPUS` — AP, radio 15m
  - `PRO_MAX_24`, `FLEX_MINI`, `FLEX`, `FLEX_ULTRA` — switches, radio 0m

## Cómo se calcula la cobertura

Puramente geométrico (¿el punto cae dentro del radio de algún AP colocado?) — **no hay backend
de señal real todavía**, es una aproximación por distancia/modelo, no una medición RF.

- `get_coverage_at_point(eventZoneId, x, y)` — cobertura en un punto puntual.
- `find_coverage_gaps(eventZoneId, planWidthPx, planHeightPx, cellSizeMeters?)` — samplea una
  grilla (tope 100.000 celdas) y devuelve qué celdas no tienen ningún AP en rango.

Requiere que la zona esté **calibrada** (2 puntos + distancia real conocida → píxeles por metro)
antes de poder consultar cobertura — si no, tira 409.

## Flujo en el frontend (`ZonePlanView.tsx`)

1. Elegir/crear evento → elegir/crear zona (con su Venue) → subir plano si no existe.
2. Modo "calibrar": marcar 2 puntos sobre una cota conocida del plano + ingresar la distancia
   real en metros.
3. Modo "colocar equipo": click en el canvas coloca un AP/switch del modelo elegido.
4. Modo "consultar cobertura": click en un punto devuelve si está cubierto y por qué AP(s).
5. Toggle "ver huecos de cobertura": pinta en el canvas las celdas sin señal.

## Integración con el chat

El LLM puede resolver nombres conversacionalmente en vez de pedir IDs — `list_events` →
`list_event_zones` → `get_coverage_at_point`/`find_coverage_gaps`/`place_ap`, encadenado en un
mismo turno (ver [[Proyecto Atlas]], sección de tools). Probado en vivo: "¿hay cobertura en el
punto x,y del Pabellón 3 de Expomin 2026?" resuelve el evento y la zona por nombre solo.

## Diseño futuro (no implementado)

**Detección de stands por visión** → ver [[Detección de stands por vision]]. La idea: leer el
plano con un LLM de visión para ubicar stands automáticamente (código + área del local, ej.
"B-55"), con confirmación humana obligatoria antes de que sea consultable por chat.

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[Detección de stands por vision]] — extensión futura de este módulo
