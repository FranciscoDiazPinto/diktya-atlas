import type { NetworkNode, WifiNetwork, Alert, NodeStatus } from "../../domain/network.js";

/**
 * Formas crudas mínimas devueltas por la API del UniFi Controller (recorte
 * de los campos que realmente usamos). No exponer este tipo fuera de este
 * módulo: todo el resto del sistema trabaja con el modelo de dominio.
 */
export interface RawUnifiDevice {
  _id: string;
  name?: string;
  model?: string;
  state: number; // 1 = connected, 0 = disconnected, 4 = adopting (convención Ubiquiti)
  site_id: string;
  "rssi"?: number;
  "num_sta"?: number;
  uptime?: number;
  last_seen?: number; // epoch seconds
  vap_table?: Array<{ essid: string }>;
}

export interface RawUnifiWlan {
  _id: string;
  name: string; // SSID
  site_id: string;
  vlan?: number;
  wlan_bands?: string[];
  num_sta?: number;
}

export interface RawUnifiAlarm {
  _id: string;
  site_id: string;
  ap?: string;
  msg: string;
  severity?: "info" | "warning" | "critical";
  time: number;
}

function mapState(state: number): NodeStatus {
  switch (state) {
    case 1:
      return "online";
    case 4:
      return "adopting";
    case 0:
      return "offline";
    default:
      return "unknown";
  }
}

function mapBand(raw: string): "2.4GHz" | "5GHz" | "6GHz" | null {
  if (raw === "ng" || raw === "2g" || raw === "2.4GHz") return "2.4GHz";
  if (raw === "na" || raw === "5g" || raw === "5GHz") return "5GHz";
  if (raw === "6e" || raw === "6GHz") return "6GHz";
  return null;
}

function mapAlarmSeverity(raw?: string): Alert["severidad"] {
  if (raw === "critical") return "CRITICO";
  if (raw === "warning") return "ADVERTENCIA";
  return "INFO";
}

export function normalizeNode(raw: RawUnifiDevice): NetworkNode {
  return {
    id: raw._id,
    sitio: raw.site_id,
    nombre: raw.name ?? raw._id,
    modelo: raw.model,
    status: mapState(raw.state),
    senalDbm: raw.rssi,
    clientesConectados: raw.num_sta ?? 0,
    uptimeSegundos: raw.uptime,
    ultimaVezVisto: new Date((raw.last_seen ?? Date.now() / 1000) * 1000).toISOString(),
    ssidsTransmitidos: (raw.vap_table ?? []).map((v) => v.essid),
  };
}

export function normalizeWifiNetwork(raw: RawUnifiWlan): WifiNetwork {
  return {
    id: raw._id,
    sitio: raw.site_id,
    ssid: raw.name,
    vlanId: raw.vlan ?? 1,
    bandas: (raw.wlan_bands ?? []).map(mapBand).filter((b): b is "2.4GHz" | "5GHz" | "6GHz" => b !== null),
    clientesConectados: raw.num_sta ?? 0,
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
