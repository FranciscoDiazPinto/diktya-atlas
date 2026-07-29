import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

export interface CreateEventDeploymentInput {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}

export async function createEventDeployment(input: CreateEventDeploymentInput) {
  return prisma.eventDeployment.create({ data: input });
}

export async function getEventDeployment(id: string) {
  const event = await prisma.eventDeployment.findUnique({
    where: { id },
    include: { zonas: true },
  });
  if (!event) throw new NotFoundError(`event deployment ${id}`);
  return event;
}

export async function listEventDeployments(nombre?: string) {
  return prisma.eventDeployment.findMany({
    where: nombre ? { nombre: { contains: nombre, mode: "insensitive" } } : undefined,
    orderBy: { fechaInicio: "desc" },
  });
}
