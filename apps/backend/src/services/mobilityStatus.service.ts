import { getMobilityClient } from "../integrations/mobility/client.js";
import { HttpError } from "../lib/errors.js";

/**
 * Resumen liviano por workspace: solo status/estado de cada device, sin el
 * detalle completo (señal LTE, VPN, ubicación, etc.) — eso vive en
 * getMobilityDeviceDetail, bajo demanda por device (evita N llamadas a la
 * API cloud solo para pintar el listado).
 */
export async function getMobilityStatus() {
  const client = getMobilityClient();
  if (!client) {
    throw new HttpError(503, "UniFi Mobility no está configurado (falta UNIFI_MOBILITY_API_KEY)");
  }

  const workspaces = await client.listWorkspaces();
  const porWorkspace = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      devices: await client.listDevices(workspace.workspace_id),
    }))
  );

  return { workspaces: porWorkspace };
}

export async function getMobilityDeviceDetail(workspaceId: string, deviceId: string) {
  const client = getMobilityClient();
  if (!client) {
    throw new HttpError(503, "UniFi Mobility no está configurado (falta UNIFI_MOBILITY_API_KEY)");
  }

  const [detail, clients] = await Promise.all([
    client.getDeviceDetail(workspaceId, deviceId),
    client.listDeviceClients(workspaceId, deviceId),
  ]);

  return { detail, clients };
}
