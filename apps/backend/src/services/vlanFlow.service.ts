import type { CsvRow, VlanPlan } from "@diktya-atlas/shared";
import { getPlan, bandasFromCsvBanda } from "./planDiff.service.js";
import { reserveVlan, getReservation } from "./vlanReservation.service.js";
import { ReservationConflictError, HttpError } from "../lib/errors.js";
import { remediationQueue } from "../workers/queues.js";

export interface ReserveItemResult {
  sitio: string;
  ssid: string;
  vlanId: number;
  ok: boolean;
  reservationId?: string;
  error?: string;
}

/**
 * "propose_vlan_plan" genera el diff completo; reservar el plan crea una
 * VlanReservation por cada ítem que implica un cambio real (se saltan los
 * "sin_cambios"). Cada ítem se reserva de forma independiente: si uno
 * choca con una reserva activa (409), se reporta ese ítem puntual y se
 * sigue con el resto — nunca se reintenta el que chocó silenciosamente.
 */
export async function reserveVlanPlanItems(planId: string, userId: string) {
  const plan = await getPlan(planId);
  const results: ReserveItemResult[] = [];

  for (const item of plan.items) {
    if (item.accion === "sin_cambios") continue;
    try {
      const reservation = await reserveVlan({
        vlanId: item.redPropuesta.vlanId,
        sitio: item.sitio,
        redSolicitada: item.redPropuesta.ssid,
        reservadoPorId: userId,
        plan,
      });
      results.push({
        sitio: item.sitio,
        ssid: item.redPropuesta.ssid,
        vlanId: item.redPropuesta.vlanId,
        ok: true,
        reservationId: reservation.id,
      });
    } catch (err) {
      if (err instanceof ReservationConflictError) {
        results.push({
          sitio: item.sitio,
          ssid: item.redPropuesta.ssid,
          vlanId: item.redPropuesta.vlanId,
          ok: false,
          error: err.message,
        });
        continue;
      }
      throw err;
    }
  }

  return { planId, results };
}

/**
 * Nunca escribe directo: solo encola el job real en remediation-queue.
 * worker-remediation es el único que toca UniFi/OPNsense de verdad.
 */
export async function enqueueApplyVlanPlan(reservationId: string) {
  const reservation = await getReservation(reservationId);
  if (reservation.estado !== "RESERVADA") {
    throw new HttpError(409, `La reserva ${reservationId} está en estado ${reservation.estado}, no se puede aplicar`);
  }

  const plan = reservation.planSnapshot as unknown as VlanPlan;
  const item = plan.items.find(
    (i) => i.sitio === reservation.sitio && i.redPropuesta.ssid === reservation.redSolicitada
  );
  const bandas = bandasFromCsvBanda((item?.redPropuesta.banda ?? "5GHz") as CsvRow["banda"]);

  const job = await remediationQueue.add(
    "apply",
    {
      reservationId,
      sitio: reservation.sitio,
      vlanId: reservation.vlanId,
      ssid: reservation.redSolicitada,
      bandas,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  return { encolado: true, jobId: job.id, reservationId };
}
