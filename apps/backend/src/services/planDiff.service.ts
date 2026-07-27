import { randomUUID } from "node:crypto";
import type { CsvRow, VlanPlan, VlanPlanItem } from "@diktya-atlas/shared";
import type { UnifiClient } from "../integrations/unifi/client.js";
import { redis } from "../db/redis.js";
import { NotFoundError } from "../lib/errors.js";

const PLAN_TTL_SECONDS = 30 * 60;

function planKey(planId: string): string {
  return `plan:${planId}`;
}

function bandasFromCsvBanda(banda: CsvRow["banda"]): Array<"2.4GHz" | "5GHz" | "6GHz"> {
  if (banda === "ambas") return ["2.4GHz", "5GHz"];
  return [banda];
}

/**
 * Compara cada fila del CSV contra el estado actual (vía UnifiClient) y
 * arma el diff. NO escribe nada — eso solo pasa en apply_vlan_plan,
 * después de reservar y de la confirmación explícita del usuario.
 */
export async function generateVlanPlan(rows: CsvRow[], unifiClient: UnifiClient): Promise<VlanPlan> {
  const items: VlanPlanItem[] = [];

  for (const row of rows) {
    const actual = await unifiClient.getWifiNetwork(row.sitio, row.ssid);
    const accion: VlanPlanItem["accion"] = !actual
      ? "crear"
      : actual.vlanId === row.vlan_id
        ? "sin_cambios"
        : "modificar";

    items.push({
      sitio: row.sitio,
      redActual: actual ? { ssid: actual.ssid, vlanId: actual.vlanId } : null,
      redPropuesta: { ssid: row.ssid, vlanId: row.vlan_id, banda: row.banda },
      accion,
    });
  }

  const plan: VlanPlan = {
    id: randomUUID(),
    items,
    creadoEn: new Date().toISOString(),
  };

  await redis.set(planKey(plan.id), JSON.stringify(plan), "EX", PLAN_TTL_SECONDS);
  return plan;
}

export async function getPlan(planId: string): Promise<VlanPlan> {
  const raw = await redis.get(planKey(planId));
  if (!raw) throw new NotFoundError(`plan ${planId} (puede haber expirado, TTL 30min)`);
  return JSON.parse(raw) as VlanPlan;
}

export { bandasFromCsvBanda };
