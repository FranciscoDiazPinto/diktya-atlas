# Diseño futuro: detección de stands por visión + confirmación humana

Estado: **propuesto, no implementado**. Este doc registra el diseño acordado para cuando se
decida construirlo — no bloquea nada del roadmap actual.

## Problema

Los planos de eventos (ej. Expomin) vienen con los stands ya dibujados: área + código de local
(ej. "B-55"), a veces con razón social. Hoy el mapeo de cobertura (`EventZone` → `ApPlacement`)
solo modela APs/switches colocados manualmente con click en el canvas. No hay forma de preguntar
"¿hay cobertura en el stand B-55?" — habría que saber de antemano las coordenadas x,y de ese
stand.

## Idea central

El agente lee el plano **una vez** (no en cada pregunta de chat), propone dónde está cada stand,
y un técnico confirma/corrige antes de que sea consultable — mismo espíritu que ya se usa para
VLANs (proponer, nunca escribir directo — ver `services/planDiff.service.ts` / reserve-not-write).

## Modelo de datos

Nueva entidad `Stand`, colgando de `EventZone` (mismo nivel que `ApPlacement`):

- `codigo` (ej. "B-55"), `nombre` opcional (si el plano trae razón social)
- `boundingBox`: rectángulo (`x, y, ancho, alto` en px del canvas) — arranca con rectángulo
  simple, no polígono, mismo nivel de complejidad geométrica que ya usan los APs. Se sube a
  polígono solo si en la práctica hay demasiados stands en L o esquineros para que el rectángulo
  alcance.
- `estado`: `DETECTADO_AUTO` | `CONFIRMADO` | `EDITADO_MANUAL` — trazabilidad de qué vino de IA
  sin revisar vs. qué confirmó un humano, consistente con `AuditLog`.

## Pipeline de detección

1. **Extender `LlmProvider`** para que soporte imágenes. Hoy `LlmMessage.content` es solo texto —
   ningún provider (OpenRouter/Anthropic/OpenAI-compatible, ver `apps/backend/src/llm/providers/`)
   recibe imágenes. Cambio contenido: agregar bloques de imagen a los payload builders, sin tocar
   el loop de tool-calling (`routes/chat.ts`).
2. **No entra al loop de `/chat`** — es una acción puntual ("Detectar stands" en
   `ZonePlanView.tsx`), no algo conversacional. El frontend ya renderiza el plano a canvas
   (`PlanCanvas.tsx`); se reusa esa imagen en vez de duplicar renderizado de PDF en el backend.
3. **Tiles, no la página completa.** Un plano de expo tiene demasiado texto chico y apretado para
   una sola pasada confiable — se parte la imagen en recortes solapados, se manda cada uno al
   modelo de visión pidiendo código + bounding box relativo al recorte, y se traducen las
   coordenadas de vuelta al plano completo, deduplicando lo que aparece en el solape.
4. Todo lo detectado entra como `DETECTADO_AUTO`, dibujado en el canvas con estilo distinto
   (borde punteado ámbar vs. sólido para confirmados). El técnico click-corrige código/esquinas o
   descarta falsos positivos.

## Consulta por chat (una vez que hay stands confirmados)

- `list_stands({eventZoneId, codigo?})` — mismo patrón de resolución por nombre que ya funciona
  hoy con `list_events`/`list_event_zones`.
- `get_coverage_by_stand({eventZoneId, codigo})` — en vez de un solo punto, samplea varios puntos
  dentro del bounding box (esquinas + centro, reusando la lógica de grilla que ya existe en
  `coverage.service.ts::findCoverageGaps`) y responde algo como "cubierto completo" / "cubierto
  parcial, falta la esquina noreste" / "sin cobertura" — más honesto que un solo punto para un
  área con superficie real.

## Riesgos a tener presente

- **Precisión**: aun con tiles, texto chico puede confundirse (B-55 vs 8-55) — por eso la
  confirmación humana no es opcional. Nunca se usa un stand `DETECTADO_AUTO` para responder
  cobertura sin que alguien lo confirme.
- **Costo/latencia**: varias llamadas de visión por plano no es instantáneo ni gratis — por diseño
  es una acción puntual por zona, no algo que corra solo en cada carga o cada pregunta.

## Fuera de alcance de este doc

- Elegir el modelo/provider de visión concreto a usar (depende de qué LLM local/cloud termine
  eligiéndose — ver decisión pendiente de hardware para LLM local).
- UI detallada del editor de bounding boxes (se resuelve al implementar, reusando patrones ya
  existentes en `PlanCanvas.tsx` para colocar/editar APs).
