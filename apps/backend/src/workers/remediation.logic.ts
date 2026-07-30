import type { VlanPlan, WifiNetwork } from "@diktya-atlas/shared";
import { prisma } from "../db/client.js";
import type { RemediationJobData } from "./queues.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { AutomatedWifiWriteNotSupportedError } from "../integrations/unifi/client.js";
import { withWriteLock, LockAcquisitionError } from "../services/lock.service.js";
import { verifyWriteAndRollbackIfNeeded } from "../services/writeVerification.service.js";
import { markApplied } from "../services/vlanReservation.service.js";
import { createTicket } from "../services/ticket.service.js";
import { recordAudit } from "../services/audit.service.js";
import { publishRealtimeEvent } from "../realtime/hub.js";

/**
 * El único lugar del sistema que escribe de verdad en UniFi/OPNsense.
 * Flujo obligatorio para CUALQUIER escritura, sin importar si la originó
 * el chat o una remediación automática:
 *   1. lock distribuido sobre write-lock:{sitio}:{vlanId}
 *   2. releer estado remoto y comparar contra el baseline conocido al
 *      reservar -> si difiere, alguien más ya escribió: abortar
 *   3. escribir
 *   4. releer y comparar campo a campo -> si no coincide, rollback
 *      automático; si el rollback también falla, ticket CRÍTICO
 *
 * Separado de worker-remediation.ts (que solo registra esto en un Worker
 * de BullMQ) para poder invocarlo directo en tests, sin depender del
 * timing async de una cola real.
 */
export async function processRemediation(data: RemediationJobData): Promise<void> {
  const reservation = await prisma.vlanReservation.findUnique({ where: { id: data.reservationId } });
  if (!reservation) {
    console.warn(`[worker-remediation] reserva ${data.reservationId} no encontrada`);
    return;
  }
  if (reservation.estado !== "RESERVADA") {
    // Idempotencia: si el job se reintenta después de haber aplicado (o
    // liberado) la reserva, no repetir la escritura.
    console.log(`[worker-remediation] reserva ${data.reservationId} ya está en estado ${reservation.estado}, no-op`);
    return;
  }

  const plan = reservation.planSnapshot as unknown as VlanPlan;
  const planItem = plan.items.find(
    (item) => item.sitio === data.sitio && item.redPropuesta.ssid === data.ssid
  );
  const baseline = planItem?.redActual ?? null;

  const client = getUnifiClient();

  try {
    await withWriteLock(data.sitio, data.vlanId, async () => {
      const currentRemote = await client.getWifiNetwork(data.sitio, data.ssid);

      const baselineMatches = baseline
        ? currentRemote !== null && currentRemote.vlanId === baseline.vlanId
        : currentRemote === null;

      if (!baselineMatches) {
        const ticket = await createTicket({
          titulo: `Doble escritura detectada en VLAN ${data.vlanId} en ${data.sitio}`,
          descripcion: `El estado remoto de "${data.ssid}" cambió entre la propuesta del plan y la aplicación. Se abortó la escritura para evitar sobrescribir un cambio concurrente.`,
          severidad: "ADVERTENCIA",
          vlanReservationId: reservation.id,
        });
        await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
        await recordAudit({
          workerName: "worker-remediation",
          toolName: "apply_vlan_plan",
          parametros: data,
          resultado: { abortado: true, motivo: "doble_escritura", ticketId: ticket.id },
          exitoso: false,
        });
        return;
      }

      let written: WifiNetwork;
      try {
        written = await client.writeWifiNetwork({
          sitio: data.sitio,
          ssid: data.ssid,
          vlanId: data.vlanId,
          bandas: data.bandas,
        });
      } catch (err) {
        if (!(err instanceof AutomatedWifiWriteNotSupportedError)) throw err;
        const ticket = await createTicket({
          titulo: `Requiere creación manual: "${data.ssid}" en ${data.sitio}`,
          descripcion: `${err.message} No es un fallo transitorio — no se reintentará automáticamente.`,
          severidad: "ADVERTENCIA",
          vlanReservationId: reservation.id,
        });
        await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
        await recordAudit({
          workerName: "worker-remediation",
          toolName: "apply_vlan_plan",
          parametros: data,
          resultado: { abortado: true, motivo: "requiere_creacion_manual", detalle: err.message, ticketId: ticket.id },
          exitoso: false,
        });
        return;
      }

      const verification = await verifyWriteAndRollbackIfNeeded({
        client,
        input: { sitio: data.sitio, ssid: data.ssid, vlanId: data.vlanId, bandas: data.bandas },
        previous: currentRemote,
      });

      if (verification.verified) {
        await markApplied(reservation.id);
        await publishRealtimeEvent({
          type: "vlan_reservation_updated",
          payload: { id: reservation.id, estado: "APLICADA" },
        });
        await recordAudit({
          workerName: "worker-remediation",
          toolName: "apply_vlan_plan",
          parametros: data,
          resultado: { escrito: written },
          exitoso: true,
        });
        return;
      }

      const rollbackFailed = !verification.rollback?.succeeded;
      const ticket = await createTicket({
        titulo: rollbackFailed
          ? `CRÍTICO: verificación post-escritura falló y el rollback también falló (VLAN ${data.vlanId}, ${data.sitio})`
          : `Verificación post-escritura falló para VLAN ${data.vlanId} en ${data.sitio} (rollback exitoso)`,
        descripcion: `Se escribió "${data.ssid}" -> VLAN ${data.vlanId} pero la relectura no coincidió. Rollback: ${JSON.stringify(verification.rollback)}`,
        severidad: rollbackFailed ? "CRITICO" : "ADVERTENCIA",
        vlanReservationId: reservation.id,
      });
      await publishRealtimeEvent({ type: "ticket_updated", payload: ticket });
      await recordAudit({
        workerName: "worker-remediation",
        toolName: "apply_vlan_plan",
        parametros: data,
        resultado: { verified: false, rollback: verification.rollback, ticketId: ticket.id },
        exitoso: false,
      });
    });
  } catch (err) {
    if (err instanceof LockAcquisitionError) {
      // Otro proceso tiene el lock: no es un fallo del plan en sí, BullMQ
      // reintentará el job con backoff (ver attempts/backoff al encolar).
      console.warn(`[worker-remediation] ${err.message}, se reintentará`);
      throw err;
    }
    await recordAudit({
      workerName: "worker-remediation",
      toolName: "apply_vlan_plan",
      parametros: data,
      resultado: { error: err instanceof Error ? err.message : String(err) },
      exitoso: false,
    });
    throw err;
  }
}
