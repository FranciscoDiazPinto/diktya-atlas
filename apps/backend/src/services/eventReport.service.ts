import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Reporte post-evento: cobertura final (zonas/APs, ya vive en Postgres) +
 * incidentes (tickets asociados vía Ticket.eventDeploymentId). No calcula
 * un % de área cubierta — eso requiere las dimensiones en píxeles del plano
 * renderizado, que solo existen client-side (ver coverage.service.ts); acá
 * se reporta qué se colocó y si la zona está calibrada, no un porcentaje.
 */
export async function getEventReport(eventDeploymentId: string) {
  const event = await prisma.eventDeployment.findUnique({
    where: { id: eventDeploymentId },
    include: {
      zonas: { include: { aps: true, venue: true } },
      tickets: { include: { eventos: true } },
    },
  });
  if (!event) throw new NotFoundError(`event deployment ${eventDeploymentId}`);

  const zonas = event.zonas.map((zona) => {
    const apsPorModelo: Partial<Record<string, number>> = {};
    for (const ap of zona.aps) {
      apsPorModelo[ap.modelo] = (apsPorModelo[ap.modelo] ?? 0) + 1;
    }
    return {
      id: zona.id,
      nombreZona: zona.nombreZona,
      venue: zona.venue.nombre,
      calibrada: zona.pixelesPorMetro !== null,
      totalAps: zona.aps.length,
      apsPorModelo,
    };
  });

  const ticketsPorSeveridad = { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 };
  const ticketsPorEstado = { ABIERTO: 0, EN_PROGRESO: 0, ESCALADO: 0, RESUELTO: 0 };
  const tiemposResolucionMs: number[] = [];

  for (const ticket of event.tickets) {
    ticketsPorSeveridad[ticket.severidad]++;
    ticketsPorEstado[ticket.estado]++;
    if (ticket.estado === "RESUELTO") {
      const resuelto = ticket.eventos.find((e) => e.tipo === "RESUELTO");
      if (resuelto) tiemposResolucionMs.push(resuelto.createdAt.getTime() - ticket.createdAt.getTime());
    }
  }

  const tiempoResolucionPromedioMin =
    tiemposResolucionMs.length > 0
      ? Math.round(tiemposResolucionMs.reduce((a, b) => a + b, 0) / tiemposResolucionMs.length / 60_000)
      : null;

  return {
    evento: {
      id: event.id,
      nombre: event.nombre,
      fechaInicio: event.fechaInicio,
      fechaFin: event.fechaFin,
      estado: event.estado,
    },
    zonas,
    tickets: {
      total: event.tickets.length,
      porSeveridad: ticketsPorSeveridad,
      porEstado: ticketsPorEstado,
      tiempoResolucionPromedioMin,
    },
  };
}
