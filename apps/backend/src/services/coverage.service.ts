import { HttpError } from "../lib/errors.js";
import { getEventZone } from "./eventZone.service.js";

const MAX_GRID_CELLS = 100_000; // guardrail: evita un barrido absurdamente denso

export interface CoveragePoint {
  cubierto: boolean;
  apsEnRango: Array<{ id: string; modelo: string; distanciaMetros: number }>;
}

export interface CoverageGapCell {
  x: number;
  y: number;
}

function distanceInMeters(x1: number, y1: number, x2: number, y2: number, pixelesPorMetro: number): number {
  const pixelDistance = Math.hypot(x2 - x1, y2 - y1);
  return pixelDistance / pixelesPorMetro;
}

async function requireCalibratedZone(eventZoneId: string) {
  const zone = await getEventZone(eventZoneId);
  if (!zone.pixelesPorMetro) {
    throw new HttpError(
      409,
      `La zona ${eventZoneId} todavía no tiene el plano calibrado (POST .../zones/:id/calibrate)`
    );
  }
  return { ...zone, pixelesPorMetro: zone.pixelesPorMetro };
}

/**
 * Distancia euclidiana simple desde cada AP (círculo de radio, sin modelar
 * paredes/materiales — acordado como suficiente para esta primera pasada).
 * Los switches (radioMetros=0) nunca "cubren" nada.
 */
export async function getCoverageAtPoint(eventZoneId: string, x: number, y: number): Promise<CoveragePoint> {
  const zone = await requireCalibratedZone(eventZoneId);

  const apsEnRango = zone.aps
    .filter((ap) => ap.radioMetros > 0)
    .map((ap) => ({
      id: ap.id,
      modelo: ap.modelo,
      radioMetros: ap.radioMetros,
      distanciaMetros: distanceInMeters(x, y, ap.x, ap.y, zone.pixelesPorMetro),
    }))
    .filter((ap) => ap.distanciaMetros <= ap.radioMetros);

  return {
    cubierto: apsEnRango.length > 0,
    apsEnRango: apsEnRango.map(({ id, modelo, distanciaMetros }) => ({
      id,
      modelo,
      distanciaMetros: Number(distanciaMetros.toFixed(1)),
    })),
  };
}

/**
 * Barrido en grilla sobre el plano de la zona: responde "hace falta
 * instalar un AP en esa zona" marcando las celdas que ningún AP alcanza.
 * `planWidthPx`/`planHeightPx` los manda el caller (el frontend, que es
 * quien conoce el tamaño real del plano renderizado en su canvas) — el
 * backend no renderiza el PDF, así que no tiene esa dimensión por su cuenta.
 */
export async function findCoverageGaps(
  eventZoneId: string,
  planWidthPx: number,
  planHeightPx: number,
  cellSizeMeters = 2
): Promise<CoverageGapCell[]> {
  if (cellSizeMeters <= 0) throw new HttpError(400, "cellSizeMeters debe ser mayor a 0");

  const zone = await requireCalibratedZone(eventZoneId);
  const ppm = zone.pixelesPorMetro;
  const cellSizePx = cellSizeMeters * ppm;

  const estimatedCells = (planWidthPx / cellSizePx) * (planHeightPx / cellSizePx);
  if (estimatedCells > MAX_GRID_CELLS) {
    throw new HttpError(400, `La grilla resultante (~${Math.round(estimatedCells)} celdas) es demasiado densa; subí cellSizeMeters`);
  }

  const aps = zone.aps.filter((ap) => ap.radioMetros > 0);
  const gaps: CoverageGapCell[] = [];

  for (let y = cellSizePx / 2; y < planHeightPx; y += cellSizePx) {
    for (let x = cellSizePx / 2; x < planWidthPx; x += cellSizePx) {
      const covered = aps.some((ap) => distanceInMeters(x, y, ap.x, ap.y, ppm) <= ap.radioMetros);
      if (!covered) gaps.push({ x: Math.round(x), y: Math.round(y) });
    }
  }

  return gaps;
}
