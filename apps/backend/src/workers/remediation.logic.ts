import { prisma } from "../db/client.js";
import type { ChangeExecutionStatus } from "@prisma/client";
import type { RemediationJobData } from "./queues.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { AutomatedWifiWriteNotSupportedError } from "../integrations/unifi/client.js";
import { withWriteLock, LockAcquisitionError } from "../services/lock.service.js";
import { verifyWriteAndRollbackIfNeeded } from "../services/writeVerification.service.js";
import { getApprovedExecution } from "../services/vlanFlow.service.js";
import { createTicket } from "../services/ticket.service.js";
import { recordAudit } from "../services/audit.service.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { HttpError } from "../lib/errors.js";

/** La cola transporta IDs; actor y configuración se reconstruyen de la aprobación durable. */
export async function processRemediation(data: RemediationJobData): Promise<void> {
  const reservation = await prisma.vlanReservation.findUnique({ where: { id: data.reservationId } });
  if (!reservation) return;
  if (!data.approvalId || reservation.approvalId !== data.approvalId) {
    await recordAudit({ workerName: "worker-remediation", toolName: "execute_vlan_approval", parametros: { reservationId: data.reservationId },
      resultado: { abortado: true, motivo: "sin_aprobacion_valida" }, exitoso: false });
    return;
  }
  // No repetir una escritura tomada, finalizada o con resultado incierto.
  if (reservation.estado !== "RESERVADA" || !["APPROVED", "QUEUED"].includes(reservation.executionStatus ?? "")) return;
  let writeAttempted = false;
  const setStatus = (status: ChangeExecutionStatus) => prisma.vlanReservation.updateMany({
    where: { id: data.reservationId, approvalId: data.approvalId, executionStatus: { in: writeAttempted ? ["EXECUTING"] : ["APPROVED", "QUEUED"] } }, data: { executionStatus: status },
  });
  const audit = (exitoso: boolean, resultado: Record<string, unknown>) => recordAudit({
    actorId: reservation.approvedById ?? undefined, workerName: "worker-remediation", toolName: "execute_vlan_approval",
    parametros: { reservationId: data.reservationId, approvalId: data.approvalId, planId: reservation.changePlanId,
      version: reservation.approvedPlanVersion, fingerprint: reservation.approvedFingerprint }, resultado, exitoso,
  });
  try {
    const initial = await getApprovedExecution(data.reservationId, data.approvalId);
    const client = getUnifiClient();
    await withWriteLock(initial.input.sitio, initial.input.vlanId, async () => {
      const execution = await getApprovedExecution(data.reservationId, data.approvalId);
      const input = execution.input;
      const currentRemote = await client.getWifiNetwork(input.sitio, input.ssid);
      const baseline = execution.item.redActual;
      const baselineMatches = baseline ? currentRemote !== null && currentRemote.vlanId === baseline.vlanId : currentRemote === null;
      if (!baselineMatches) {
        await setStatus("BLOCKED");
        const ticket = await createTicket({ titulo: `Cambio concurrente en VLAN ${input.vlanId} en ${input.sitio}`,
          descripcion: `El estado remoto de "${input.ssid}" cambió desde la propuesta. Se requiere revisar y aprobar otro plan.`,
          severidad: "ADVERTENCIA", vlanReservationId: reservation.id });
        await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
        await audit(false, { abortado: true, motivo: "doble_escritura", ticketId: ticket.id });
        return;
      }
      // La lectura remota puede tardar: comprobar otra vez identidad, plan y vigencia.
      await getApprovedExecution(data.reservationId, data.approvalId);
      const claimed = await prisma.vlanReservation.updateMany({ where: {
        id: data.reservationId, approvalId: data.approvalId, estado: "RESERVADA", approvedBy: { role: execution.ctx.role }, executionStatus: { in: ["APPROVED", "QUEUED"] }, approvalExpiresAt: { gt: new Date() },
      }, data: { executionStatus: "EXECUTING" } });
      if (!claimed.count) return;
      writeAttempted = true;
      try {
        await client.writeWifiNetwork(input);
      } catch (err) {
        if (!(err instanceof AutomatedWifiWriteNotSupportedError)) throw err;
        await setStatus("BLOCKED");
        const ticket = await createTicket({ titulo: `Requiere creación manual: "${input.ssid}" en ${input.sitio}`,
          descripcion: "El proveedor no admite esta escritura automática. No se reintentará esta aprobación.",
          severidad: "ADVERTENCIA", vlanReservationId: reservation.id });
        await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
        await audit(false, { abortado: true, motivo: "requiere_creacion_manual", ticketId: ticket.id });
        return;
      }
      const verification = await verifyWriteAndRollbackIfNeeded({ client, input, previous: currentRemote });
      if (verification.verified) {
        await prisma.$transaction([
          prisma.vlanReservation.update({ where: { id: reservation.id }, data: { estado: "APLICADA", executionStatus: "APPLIED" } }),
          prisma.auditLog.create({ data: { actorId: reservation.approvedById, workerName: "worker-remediation", toolName: "execute_vlan_approval",
            parametros: { reservationId: reservation.id, approvalId: data.approvalId, fingerprint: reservation.approvedFingerprint },
            resultado: { estado: "APPLIED", verified: true }, exitoso: true } }),
        ]);
        await publishRealtimeEvent({ type: "vlan_reservation_updated", payload: { id: reservation.id, estado: "APLICADA", executionStatus: "APPLIED" } });
        return;
      }
      const rollbackFailed = !verification.rollback?.succeeded;
      await setStatus(rollbackFailed ? "UNCERTAIN" : "FAILED");
      const ticket = await createTicket({ titulo: rollbackFailed
        ? `CRÍTICO: verificación y rollback fallidos (VLAN ${input.vlanId}, ${input.sitio})`
        : `Verificación fallida con rollback exitoso (VLAN ${input.vlanId}, ${input.sitio})`,
        descripcion: `No se verificó "${input.ssid}". La aprobación no se reintentará automáticamente.`,
        severidad: rollbackFailed ? "CRITICO" : "ADVERTENCIA", vlanReservationId: reservation.id });
      await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
      await audit(false, { verified: false, rollback: verification.rollback, ticketId: ticket.id });
    });
  } catch (err) {
    if (err instanceof LockAcquisitionError) throw err;
    if (writeAttempted) await setStatus("UNCERTAIN");
    else if (err instanceof HttpError) await setStatus("BLOCKED");
    await audit(false, { abortado: true, motivo: writeAttempted ? "resultado_incierto" : err instanceof HttpError ? "aprobacion_no_vigente" : "fallo_previo_a_escritura" });
    if (!(err instanceof HttpError)) throw err;
  }
}
