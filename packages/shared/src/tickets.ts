import { z } from "zod";
import { AlertSeveritySchema } from "./network.js";

export const TicketStatusSchema = z.enum([
  "ABIERTO",
  "EN_PROGRESO",
  "ESCALADO",
  "RESUELTO",
]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TicketEventTypeSchema = z.enum([
  "CREADO",
  "NOTIFICADO",
  "REMEDIACION_INTENTADA",
  "ESCALADO",
  "RESUELTO",
  "REABIERTO",
]);
export type TicketEventType = z.infer<typeof TicketEventTypeSchema>;

export const TicketEventSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  tipo: TicketEventTypeSchema,
  detalle: z.string(),
  creadoEn: z.string().datetime(),
});
export type TicketEvent = z.infer<typeof TicketEventSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  severidad: AlertSeveritySchema,
  estado: TicketStatusSchema,
  nodoAfectado: z.string().optional(),
  vlanReservationId: z.string().optional(),
  asignadoA: z.string().optional(),
  creadoEn: z.string().datetime(),
  actualizadoEn: z.string().datetime(),
});
export type Ticket = z.infer<typeof TicketSchema>;
