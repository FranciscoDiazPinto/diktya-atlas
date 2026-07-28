import type { ApModel } from "@prisma/client";
import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";
import { getEventZone } from "./eventZone.service.js";

/**
 * Radios default en metros — punto de partida editable a mano por AP, NO
 * una medición real de RF (no se modelan paredes/materiales, ver plan del
 * módulo). Los switches de rack perimetral (Pro Max 24, Flex*) no emiten
 * WiFi: radio 0, quedan fuera del cálculo de cobertura.
 */
export const DEFAULT_RADIUS_METERS: Record<ApModel, number> = {
  U6_MESH: 20,
  U7_CAMPUS: 15,
  PRO_MAX_24: 0,
  FLEX_MINI: 0,
  FLEX: 0,
  FLEX_ULTRA: 0,
};

export interface PlaceApInput {
  eventZoneId: string;
  modelo: ApModel;
  x: number;
  y: number;
  radioMetros?: number;
  rackLabel?: string;
}

export async function placeAp(input: PlaceApInput) {
  await getEventZone(input.eventZoneId);
  return prisma.apPlacement.create({
    data: {
      eventZoneId: input.eventZoneId,
      modelo: input.modelo,
      x: input.x,
      y: input.y,
      radioMetros: input.radioMetros ?? DEFAULT_RADIUS_METERS[input.modelo],
      rackLabel: input.rackLabel,
    },
  });
}

export interface UpdateApInput {
  x?: number;
  y?: number;
  radioMetros?: number;
  rackLabel?: string;
}

export async function updateAp(id: string, patch: UpdateApInput) {
  const existing = await prisma.apPlacement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`AP ${id}`);
  return prisma.apPlacement.update({ where: { id }, data: patch });
}

export async function deleteAp(id: string): Promise<void> {
  const existing = await prisma.apPlacement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`AP ${id}`);
  await prisma.apPlacement.delete({ where: { id } });
}

export async function listAps(eventZoneId: string) {
  await getEventZone(eventZoneId);
  return prisma.apPlacement.findMany({ where: { eventZoneId } });
}
