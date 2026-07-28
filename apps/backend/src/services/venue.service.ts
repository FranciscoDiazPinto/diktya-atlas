import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

export interface CreateVenueInput {
  nombre: string;
  planFilePath: string;
}

export async function createVenue(input: CreateVenueInput) {
  return prisma.venue.create({ data: input });
}

export async function listVenues() {
  return prisma.venue.findMany({ orderBy: { nombre: "asc" } });
}

export async function getVenue(id: string) {
  const venue = await prisma.venue.findUnique({ where: { id }, include: { zonas: true } });
  if (!venue) throw new NotFoundError(`venue ${id}`);
  return venue;
}
