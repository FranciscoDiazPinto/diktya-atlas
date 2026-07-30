import { Worker } from "bullmq";
import { createRedisConnection } from "../db/redis.js";
import { prisma } from "../db/client.js";
import type { TriageJobData } from "./queues.js";
import { createTicket } from "../services/ticket.service.js";
import { notifyTechnicians } from "../services/notification.service.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { recordAudit } from "../services/audit.service.js";
import { getLlmProvider } from "../llm/providers/index.js";
import type { AlertSeverity } from "@diktya-atlas/shared";

// AP sin responder por más de esto = crítico automático, sin pasar por el LLM.
const OFFLINE_CRITICAL_MINUTES = 10;

async function classifyWithLlm(mensaje: string): Promise<AlertSeverity> {
  const provider = getLlmProvider();
  const result = await provider.chat({
    messages: [
      {
        role: "system",
        content:
          'Clasificás la severidad de alertas de red. Respondé EXCLUSIVAMENTE con una palabra: INFO, ADVERTENCIA o CRITICO.',
      },
      { role: "user", content: mensaje },
    ],
    tools: [],
  });
  const text = result.message.content.trim().toUpperCase();
  if (text.includes("CRITICO")) return "CRITICO";
  if (text.includes("INFO")) return "INFO";
  return "ADVERTENCIA";
}

/**
 * Reglas duras primero (rápidas, deterministas, sin costo de LLM). El LLM
 * solo entra para casos ambiguos que las reglas duras no resuelven. Si el
 * LLM no está disponible (sin API key en esta primera pasada), se usa la
 * severidad ya asignada por worker-monitor como fallback — nunca se
 * bloquea el ticket por falta de LLM.
 */
async function triageAlert(alertId: string): Promise<void> {
  const alert = await prisma.alert.findUnique({ where: { id: alertId }, include: { node: true } });
  if (!alert) {
    console.warn(`[worker-triage] alerta ${alertId} no encontrada (¿ya resuelta?)`);
    return;
  }

  let severidad: AlertSeverity = alert.severidad;
  let clasificacion: "regla_dura" | "llm" | "fallback" = "regla_dura";

  const offlineMinutos = alert.node?.ultimaVezVisto
    ? (Date.now() - alert.node.ultimaVezVisto.getTime()) / 60_000
    : 0;
  const offlineCritico = offlineMinutos >= OFFLINE_CRITICAL_MINUTES;

  if (offlineCritico) {
    severidad = "CRITICO";
  } else {
    try {
      severidad = await classifyWithLlm(alert.mensaje);
      clasificacion = "llm";
    } catch (err) {
      console.warn("[worker-triage] LLM no disponible, uso severidad de fallback", err);
      clasificacion = "fallback";
    }
  }

  // El AP nunca se reinicia solo desde acá — worker-remediation por ahora
  // solo ejecuta aplicación de VLAN. Lo único que hace este flujo es
  // sugerir la acción en la descripción del ticket; un técnico la confirma
  // manualmente desde /red (POST /network/nodes/:id/reboot).
  const descripcion = offlineCritico
    ? `${alert.mensaje}\n\nSugerencia: lleva ${Math.round(offlineMinutos)} min sin responder — considerá reiniciarlo desde la vista Red (acción manual, requiere confirmación).`
    : alert.mensaje;

  const ticket = await createTicket({
    titulo: `Alerta ${severidad} en ${alert.sitio}`,
    descripcion,
    severidad,
    nodoAfectadoId: alert.nodeId ?? undefined,
  });

  await prisma.alert.update({ where: { id: alert.id }, data: { ticketId: ticket.id } });
  await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });

  await notifyTechnicians({ mensaje: alert.mensaje, severidad, sitio: alert.sitio });

  await recordAudit({
    workerName: "worker-triage",
    parametros: { alertId, clasificacion },
    resultado: { ticketId: ticket.id, severidad },
    exitoso: true,
  });
}

const worker = new Worker<TriageJobData>(
  "triage",
  async (job) => triageAlert(job.data.alertId),
  { connection: createRedisConnection() }
);

worker.on("failed", (job, err) => {
  console.error(`[worker-triage] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-triage] escuchando cola 'triage'..."));
