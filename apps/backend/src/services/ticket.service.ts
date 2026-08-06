import type { AlertSeverity } from "@diktya-atlas/shared";
import { prisma } from "../db/client.js";
import { HttpError, NotFoundError } from "../lib/errors.js";

export interface CreateTicketInput {
  titulo: string;
  descripcion: string;
  severidad: AlertSeverity;
  nodoAfectadoId?: string;
  vlanReservationId?: string;
  // Opcional: solo se completa cuando el ticket se crea en contexto de un evento (para reportería).
  eventDeploymentId?: string;
}

export async function createTicket(input: CreateTicketInput) {
  const ticket = await prisma.ticket.create({
    data: {
      titulo: input.titulo,
      descripcion: input.descripcion,
      severidad: input.severidad,
      nodoAfectadoId: input.nodoAfectadoId,
      vlanReservationId: input.vlanReservationId,
      eventDeploymentId: input.eventDeploymentId,
    },
  });
  await prisma.ticketEvent.create({
    data: { ticketId: ticket.id, tipo: "CREADO", detalle: input.titulo },
  });
  return ticket;
}

export async function addTicketEvent(
  ticketId: string,
  tipo: "NOTIFICADO" | "REMEDIACION_INTENTADA" | "ESCALADO" | "RESUELTO" | "REABIERTO" | "ASIGNADO",
  detalle: string
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError(`ticket ${ticketId}`);
  return prisma.ticketEvent.create({ data: { ticketId, tipo, detalle } });
}

export async function escalateTicket(ticketId: string, motivo: string) {
  await prisma.ticket.update({ where: { id: ticketId }, data: { estado: "ESCALADO" } });
  return addTicketEvent(ticketId, "ESCALADO", motivo);
}

export async function resolveTicket(ticketId: string) {
  await prisma.ticket.update({ where: { id: ticketId }, data: { estado: "RESUELTO" } });
  return addTicketEvent(ticketId, "RESUELTO", "Marcado como resuelto");
}

export async function reopenTicket(ticketId: string) {
  await prisma.ticket.update({ where: { id: ticketId }, data: { estado: "ABIERTO" } });
  return addTicketEvent(ticketId, "REABIERTO", "Reabierto");
}

/**
 * `Ticket.asignadoAId` existía en el schema desde antes pero no lo escribía
 * nadie (ni service, ni ruta, ni tool) — ver Atlas/LLM y tools.md § Backlog.
 * VISUALIZADOR nunca puede ser asignatario: no tiene tools de escritura, no
 * tendría cómo "hacerse cargo" de un ticket.
 */
export async function assignTicket(ticketId: string, userId: string) {
  const [ticket, user] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!ticket) throw new NotFoundError(`ticket ${ticketId}`);
  if (!user) throw new NotFoundError(`usuario ${userId}`);
  if (user.role === "VISUALIZADOR") {
    throw new HttpError(400, `${user.email} tiene rol VISUALIZADOR — no puede ser asignado a un ticket`);
  }

  await prisma.ticket.update({ where: { id: ticketId }, data: { asignadoAId: userId } });
  return addTicketEvent(ticketId, "ASIGNADO", `Asignado a ${user.email}`);
}

export async function listOpenTicketsForFollowup() {
  return prisma.ticket.findMany({
    where: { estado: { in: ["ABIERTO", "EN_PROGRESO", "ESCALADO"] } },
    include: { eventos: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
}
