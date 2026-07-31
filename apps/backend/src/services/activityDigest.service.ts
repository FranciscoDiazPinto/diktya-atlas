import { prisma } from "../db/client.js";

export interface ActivityDigestParams {
  desde: Date;
  hasta: Date;
  eventDeploymentId?: string;
}

/**
 * Reporte de actividad ("qué pasó") en un rango de fechas, opcionalmente
 * acotado a un evento — construido enteramente con datos que ya existen
 * (Alert/Ticket/AuditLog/VlanReservation, todos con createdAt). No es un
 * reporte de uptime real: NetworkNode solo guarda el estado actual, se
 * sobreescribe en cada sync — `estadoActual` es una foto de ahora mismo,
 * no del rango consultado. Ver Atlas/Proyecto Atlas.md para ese pendiente.
 */
export async function getActivityDigest(params: ActivityDigestParams) {
  const { desde, hasta, eventDeploymentId } = params;
  const rango = { gte: desde, lte: hasta };

  const [nodos, alertas, tickets, auditLogs, vlanReservations] = await Promise.all([
    prisma.networkNode.findMany(),
    prisma.alert.findMany({ where: { createdAt: rango }, orderBy: { createdAt: "desc" } }),
    prisma.ticket.findMany({
      where: { createdAt: rango, ...(eventDeploymentId ? { eventDeploymentId } : {}) },
      include: { eventos: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({ where: { createdAt: rango } }),
    prisma.vlanReservation.findMany({ where: { createdAt: rango } }),
  ]);

  const estadoActual = {
    totalNodos: nodos.length,
    online: nodos.filter((n) => n.status === "ONLINE").length,
    offline: nodos.filter((n) => n.status === "OFFLINE").length,
    adoptando: nodos.filter((n) => n.status === "ADOPTING").length,
  };

  const alertasPorSeveridad = { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 };
  for (const a of alertas) alertasPorSeveridad[a.severidad]++;

  const ticketsPorSeveridad = { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 };
  const ticketsPorEstado = { ABIERTO: 0, EN_PROGRESO: 0, ESCALADO: 0, RESUELTO: 0 };
  const tiemposResolucionMs: number[] = [];
  for (const t of tickets) {
    ticketsPorSeveridad[t.severidad]++;
    ticketsPorEstado[t.estado]++;
    if (t.estado === "RESUELTO") {
      const resuelto = t.eventos.find((e) => e.tipo === "RESUELTO");
      if (resuelto) tiemposResolucionMs.push(resuelto.createdAt.getTime() - t.createdAt.getTime());
    }
  }
  const tiempoResolucionPromedioMin =
    tiemposResolucionMs.length > 0
      ? Math.round(tiemposResolucionMs.reduce((a, b) => a + b, 0) / tiemposResolucionMs.length / 60_000)
      : null;

  const vlanPorEstado = { RESERVADA: 0, APLICADA: 0, LIBERADA: 0 };
  for (const r of vlanReservations) vlanPorEstado[r.estado]++;

  const auditoriaPorWorker: Record<string, { total: number; exitosos: number; fallidos: number }> = {};
  for (const log of auditLogs) {
    const entry = (auditoriaPorWorker[log.workerName] ??= { total: 0, exitosos: 0, fallidos: 0 });
    entry.total++;
    if (log.exitoso) entry.exitosos++;
    else entry.fallidos++;
  }

  return {
    rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
    eventDeploymentId: eventDeploymentId ?? null,
    estadoActual,
    alertas: { total: alertas.length, porSeveridad: alertasPorSeveridad, items: alertas },
    tickets: { total: tickets.length, porSeveridad: ticketsPorSeveridad, porEstado: ticketsPorEstado, tiempoResolucionPromedioMin },
    vlan: { total: vlanReservations.length, porEstado: vlanPorEstado },
    auditoria: {
      total: auditLogs.length,
      exitosos: auditLogs.filter((l) => l.exitoso).length,
      fallidos: auditLogs.filter((l) => !l.exitoso).length,
      porWorker: auditoriaPorWorker,
    },
  };
}
