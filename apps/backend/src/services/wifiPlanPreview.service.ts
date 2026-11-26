import { z } from "zod";
import type { WifiPreviewInventory } from "../integrations/unifi/client.js";

export const WIFI_PLAN_CONTRACT_VERSION = "11.0.104";

export const WifiPlanPreviewSchema = z.object({
  sitio: z.string().trim().min(1).max(128),
  apIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
  filas: z.array(z.object({
    fila: z.number().int().positive().safe(),
    ssid: z.string().refine(
      (ssid) => ssid.trim().length > 0 && Buffer.byteLength(ssid, "utf8") <= 32 && !/\p{Cc}/u.test(ssid),
      "El SSID debe ocupar de 1 a 32 bytes UTF-8 y no contener caracteres de control."
    ),
    vlanId: z.number().int().min(1).max(4094),
  })).min(1).max(500),
});

export function previewWifiPlan(input: z.infer<typeof WifiPlanPreviewSchema>, inventory: WifiPreviewInventory) {
  const accessPoints = new Map(inventory.accessPoints.map((ap) => [ap.id, ap]));
  const selected = [...new Set(input.apIds)].map((id) => ({ id, nombre: accessPoints.get(id)?.name ?? null }));
  const unknownApIds = selected.filter(({ nombre }) => nombre === null).map(({ id }) => id);
  const ssids = new Set(inventory.ssids);
  const counts = new Map<string, number>();
  for (const { ssid } of input.filas) counts.set(ssid, (counts.get(ssid) ?? 0) + 1);

  const networks = new Map<number, string[]>();
  for (const { id, vlanId } of inventory.networks) {
    const ids = networks.get(vlanId) ?? [];
    ids.push(id);
    networks.set(vlanId, ids);
  }

  const filas = input.filas.map((row) => {
    const errores: string[] = [];
    const networkIds = networks.get(row.vlanId) ?? [];
    if (ssids.has(row.ssid)) errores.push("El SSID ya existe en este sitio.");
    if ((counts.get(row.ssid) ?? 0) > 1) errores.push("El SSID se repite en la importación.");
    if (networkIds.length === 0) errores.push("La VLAN no existe en este sitio.");
    if (networkIds.length > 1) errores.push("La VLAN corresponde a más de una red en este sitio.");
    return { ...row, networkId: networkIds.length === 1 ? networkIds[0] : null, errores };
  });

  return {
    sitio: input.sitio,
    contractVersion: WIFI_PLAN_CONTRACT_VERSION,
    accessPoints: selected,
    unknownApIds,
    valid: unknownApIds.length === 0 && filas.every(({ errores }) => errores.length === 0),
    filas,
  };
}
