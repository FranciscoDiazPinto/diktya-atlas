import { Queue } from "bullmq";
import { createRedisConnection } from "../db/redis.js";

/**
 * 6 colas independientes = 6 workers escalables/reiniciables por separado
 * (ver package.json: worker:monitor, worker:triage, worker:remediation,
 * worker:ticket-followup, worker:autoremediate — chat-orchestrator corre
 * dentro del proceso HTTP porque es el único que conversa con el usuario,
 * no tiene trabajo pesado en background propio).
 */

export interface MonitorJobData {
  sitio?: string;
}

export interface TriageJobData {
  alertId: string;
  /** Contexto de un intento de auto-remediación previo (ver worker-autoremediate) — se agrega a la descripción del ticket. */
  notaPrevia?: string;
}

export interface AutoRemediateJobData {
  nodeId: string;
  alertId: string;
}

export interface RemediationJobData {
  reservationId: string;
  sitio: string;
  vlanId: number;
  ssid: string;
  bandas: Array<"2.4GHz" | "5GHz" | "6GHz">;
}

export interface TicketFollowupJobData {
  // Job de barrido: sin payload, revisa todos los tickets abiertos.
  tick: true;
}

const connection = createRedisConnection();

export const monitorQueue = new Queue<MonitorJobData>("monitor", { connection });
export const triageQueue = new Queue<TriageJobData>("triage", { connection });
export const remediationQueue = new Queue<RemediationJobData>("remediation", { connection });
export const ticketFollowupQueue = new Queue<TicketFollowupJobData>("ticket-followup", { connection });
export const autoRemediateQueue = new Queue<AutoRemediateJobData>("auto-remediate", { connection });

const MONITOR_POLL_MS = 30_000;
const TICKET_FOLLOWUP_TICK_MS = 5 * 60_000;

export async function scheduleRepeatableJobs(): Promise<void> {
  await monitorQueue.upsertJobScheduler(
    "poll-all-sites",
    { every: MONITOR_POLL_MS },
    { name: "poll", data: {} }
  );
  await ticketFollowupQueue.upsertJobScheduler(
    "ticket-followup-tick",
    { every: TICKET_FOLLOWUP_TICK_MS },
    { name: "tick", data: { tick: true } }
  );
}
