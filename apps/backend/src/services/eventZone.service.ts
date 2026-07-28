import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";
import { getEventDeployment } from "./eventDeployment.service.js";
import { getVenue } from "./venue.service.js";

export interface CreateEventZoneInput {
  eventDeploymentId: string;
  venueId: string;
  nombreZona: string;
  planFilePath?: string;
}

export async function createEventZone(input: CreateEventZoneInput) {
  await getEventDeployment(input.eventDeploymentId); // 404 claro si el evento no existe
  await getVenue(input.venueId); // 404 claro si el recinto no existe
  return prisma.eventZone.create({ data: input });
}

export async function getEventZone(id: string) {
  const zone = await prisma.eventZone.findUnique({
    where: { id },
    include: { venue: true, aps: true },
  });
  if (!zone) throw new NotFoundError(`event zone ${id}`);
  return zone;
}

export async function listEventZones(eventDeploymentId: string) {
  await getEventDeployment(eventDeploymentId);
  return prisma.eventZone.findMany({
    where: { eventDeploymentId },
    include: { venue: true },
    orderBy: { nombreZona: "asc" },
  });
}

export interface CalibrationPoint {
  x: number;
  y: number;
}

/**
 * Deriva píxeles-por-metro a partir de dos puntos marcados sobre una cota
 * conocida del plano (los planos reales ya traen cotas impresas en metros)
 * y la distancia real que representan. Cada zona se calibra por separado
 * porque puede estar a una escala distinta de las demás del mismo evento.
 */
export function computePixelsPerMeter(p1: CalibrationPoint, p2: CalibrationPoint, distanciaMetros: number): number {
  if (distanciaMetros <= 0) {
    throw new Error("La distancia real de calibración debe ser mayor a 0");
  }
  const pixelDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (pixelDistance === 0) {
    throw new Error("Los dos puntos de calibración no pueden ser el mismo punto");
  }
  return pixelDistance / distanciaMetros;
}

export async function calibrateZone(id: string, p1: CalibrationPoint, p2: CalibrationPoint, distanciaMetros: number) {
  await getEventZone(id);
  const pixelesPorMetro = computePixelsPerMeter(p1, p2, distanciaMetros);
  return prisma.eventZone.update({ where: { id }, data: { pixelesPorMetro } });
}
