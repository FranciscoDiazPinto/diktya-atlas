import type { NetworkNode, WifiNetwork, Alert, NodeStatus, DeviceType } from "../../domain/network.js";
import type { UnifiOsWifiBroadcastOverview, UnifiOsDevice, UnifiOsDeviceLatestStatistics } from "../unifiOs/client.js";

/**
 * Formas crudas mínimas devueltas por la API del UniFi Controller (recorte
 * de los campos que realmente usamos). No exponer este tipo fuera de este
 * módulo: todo el resto del sistema trabaja con el modelo de dominio.
 */
export interface RawUnifiAlarm {
  _id: string;
  site_id: string;
  ap?: string;
  msg: string;
  severity?: "info" | "warning" | "critical";
  time: number;
}

/**
 * Estados de la Integration API (`Adopted device overview.state`), más
 * granulares que la API clásica — se colapsan a los 4 valores del dominio.
 * `CONNECTION_INTERRUPTED`/`ISOLATED`/`DELETING`/`U5G_INCORRECT_TOPOLOGY`
 * no tienen un equivalente claro online/offline, van a "unknown" (honesto
 * en vez de adivinar).
 */
function mapDeviceState(state: string): NodeStatus {
  switch (state) {
    case "ONLINE":
      return "online";
    case "OFFLINE":
      return "offline";
    case "ADOPTING":
    case "PENDING_ADOPTION":
    case "GETTING_READY":
    case "UPDATING":
      return "adopting";
    default:
      return "unknown";
  }
}

/**
 * `features` no siempre alcanza para clasificar — dos casos confirmados
 * contra hardware real: un UPS reportó `features: ["switching"]` (no hay
 * valor "ups" en el enum de la API), y el gateway (`Enterprise Fortress
 * Gateway`) reportó `features: []` vacío del todo. Por eso el modelo entra
 * primero como caso especial para ambos; el resto se clasifica por feature.
 */
function mapDeviceType(device: UnifiOsDevice): DeviceType {
  const model = device.model.toUpperCase();
  if (model.includes("UPS")) return "UPS";
  if (model.includes("GATEWAY") || model.includes("EFG") || model.includes("UDM")) return "GATEWAY";
  if (device.features.includes("gateway")) return "GATEWAY";
  if (device.features.includes("accessPoint")) return "AP";
  if (device.features.includes("switching")) return "SWITCH";
  return "OTRO";
}

function mapBand(raw: string): "2.4GHz" | "5GHz" | "6GHz" | null {
  if (raw === "ng" || raw === "2g" || raw === "2.4GHz") return "2.4GHz";
  if (raw === "na" || raw === "5g" || raw === "5GHz") return "5GHz";
  if (raw === "6e" || raw === "6GHz") return "6GHz";
  return null;
}

export function mapGhzToBand(ghz: number): "2.4GHz" | "5GHz" | "6GHz" {
  if (ghz === 2.4) return "2.4GHz";
  if (ghz === 5) return "5GHz";
  return "6GHz";
}

export function mapBandToGhz(band: "2.4GHz" | "5GHz" | "6GHz"): number {
  if (band === "2.4GHz") return 2.4;
  if (band === "5GHz") return 5;
  return 6;
}

function mapAlarmSeverity(raw?: string): Alert["severidad"] {
  if (raw === "critical") return "CRITICO";
  if (raw === "warning") return "ADVERTENCIA";
  return "INFO";
}

/**
 * La Integration API no expone señal (`senalDbm`) a nivel de device — ni el
 * overview ni las estadísticas la traen (confirmado contra un UDM real);
 * queda `undefined` (campo opcional en el dominio) en vez de inventar un
 * valor. `stats`/`ultimaVezVisto` vienen de una llamada aparte a
 * `getDeviceLatestStatistics` (ver liveClient.ts::listNodes) — si por lo
 * que sea no está disponible, se usa el momento de la lectura como último
 * recurso (el dominio exige un datetime, no puede quedar vacío).
 */
export function normalizeIntegrationDevice(
  device: UnifiOsDevice,
  sitio: string,
  stats: UnifiOsDeviceLatestStatistics | undefined,
  clientesConectados: number,
  ssidsTransmitidos: string[]
): NetworkNode {
  return {
    id: device.id,
    sitio,
    nombre: device.name,
    modelo: device.model,
    tipoDispositivo: mapDeviceType(device),
    status: mapDeviceState(device.state),
    clientesConectados,
    uptimeSegundos: stats?.uptimeSec,
    ultimaVezVisto: stats?.lastHeartbeatAt ?? new Date().toISOString(),
    ssidsTransmitidos,
  };
}

/**
 * `broadcast.network` referencia una `Network` por id, o está ausente
 * (confirmado contra un UDM real) cuando usa la red nativa/por defecto del
 * sitio — el VLAN vive en esa `Network`, no en el broadcast.
 * `vlanIdByNetworkId`/`defaultVlanId` vienen de una lectura separada de
 * `GET .../networks` (ver liveClient.ts::listWifiNetworks).
 */
export function normalizeIntegrationWifiBroadcast(
  broadcast: UnifiOsWifiBroadcastOverview,
  sitio: string,
  vlanIdByNetworkId: Map<string, number>,
  defaultVlanId: number
): WifiNetwork {
  const vlanId =
    broadcast.network?.type === "SPECIFIC"
      ? (vlanIdByNetworkId.get(broadcast.network.networkId) ?? defaultVlanId)
      : defaultVlanId;
  return {
    id: broadcast.id,
    sitio,
    ssid: broadcast.name,
    vlanId,
    bandas: (broadcast.broadcastingFrequenciesGHz ?? []).map(mapGhzToBand),
    clientesConectados: 0,
  };
}

export function normalizeAlert(raw: RawUnifiAlarm): Alert {
  return {
    id: raw._id,
    sitio: raw.site_id,
    nodeId: raw.ap,
    severidad: mapAlarmSeverity(raw.severity),
    mensaje: raw.msg,
    creadoEn: new Date(raw.time).toISOString(),
  };
}
