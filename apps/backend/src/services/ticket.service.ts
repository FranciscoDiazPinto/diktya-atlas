import type { AlertSeverity } from "@diktya-atlas/shared";
import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

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
  tipo: "NOTIFICADO" | "REMEDIACION_INTENTADA" | "ESCALADO" | "RESUELTO" | "REABIERTO",
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

export async function listOpenTicketsForFollowup() {
  return prisma.ticket.findMany({
    where: { estado: { in: ["ABIERTO", "EN_PROGRESO", "ESCALADO"] } },
    include: { eventos: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
}
