import type { AlertSeverity } from "@diktya-atlas/shared";
import { prisma } from "../db/client.js";

export interface ListOpenIssuesParams {
  sitio?: string;
  severidad?: AlertSeverity;
}

/**
 * "¿Qué queda pendiente ahora mismo?" — pensado para lo primero que
 * pregunta un técnico entrando a un turno. Dos categorías separadas, no
 * mezcladas: tickets sin resolver (el trabajo formal, ya asignable/
 * escalable) y alertas sin ticket todavía (algo saltó pero nadie lo
 * formalizó — puede estar esperando a worker-triage, o ser una alerta que
 * nunca se escaló). Una alerta que ya generó su ticket no aparece acá dos
 * veces: se sigue por el ticket, no por la alerta cruda.
 */
export async function listOpenIssues(params: ListOpenIssuesParams) {
  const [tickets, alertasSinTicket] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        estado: { in: ["ABIERTO", "EN_PROGRESO", "ESCALADO"] },
        ...(params.severidad ? { severidad: params.severidad } : {}),
        ...(params.sitio ? { nodoAfectado: { sitio: params.sitio } } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.findMany({
      where: {
        ticketId: null,
        ...(params.sitio ? { sitio: params.sitio } : {}),
        ...(params.severidad ? { severidad: params.severidad } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { tickets, alertasSinTicket };
}
