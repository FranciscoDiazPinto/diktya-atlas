import { Worker } from "bullmq";
import type { AlertSeverity } from "@diktya-atlas/shared";
import { createRedisConnection } from "../db/redis.js";
import { listOpenTicketsForFollowup, addTicketEvent } from "../services/ticket.service.js";
import { notifyTechnicians } from "../services/notification.service.js";
import { recordAudit } from "../services/audit.service.js";
import type { TicketFollowupJobData } from "./queues.js";

// Cada cuánto se re-notifica un ticket sin resolver, según severidad.
// Configurable a futuro por rol/turno; por ahora es un valor fijo por severidad.
const REMINDER_INTERVAL_MINUTES: Record<AlertSeverity, number> = {
  CRITICO: 15,
  ADVERTENCIA: 60,
  INFO: 24 * 60,
};

async function runFollowupTick(): Promise<void> {
  const tickets = await listOpenTicketsForFollowup();
  const now = Date.now();

  for (const ticket of tickets) {
    const lastEvent = ticket.eventos[0];
    const lastEventAt = lastEvent?.createdAt ?? ticket.createdAt;
    const minutesSinceLast = (now - lastEventAt.getTime()) / 60_000;
    const intervalMinutes = REMINDER_INTERVAL_MINUTES[ticket.severidad];

    if (minutesSinceLast < intervalMinutes) continue;

    await notifyTechnicians({
      mensaje: `Recordatorio: ticket "${ticket.titulo}" sigue ${ticket.estado} (severidad ${ticket.severidad})`,
      severidad: ticket.severidad,
    });
    await addTicketEvent(ticket.id, "NOTIFICADO", `Recordatorio automático (${Math.round(minutesSinceLast)} min sin resolverse)`);
    await recordAudit({
      workerName: "worker-ticket-followup",
      parametros: { ticketId: ticket.id },
      resultado: { notificado: true },
      exitoso: true,
    });
  }
}

const worker = new Worker<TicketFollowupJobData>(
  "ticket-followup",
  async () => runFollowupTick(),
  { connection: createRedisConnection() }
);

worker.on("failed", (job, err) => {
  console.error(`[worker-ticket-followup] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-ticket-followup] escuchando cola 'ticket-followup'..."));
