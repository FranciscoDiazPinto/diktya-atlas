import { fetch as undiciFetch } from "undici";
import { env } from "../../config/env.js";

export type MobilityWorkspaceStatus = "ACTIVE" | "PENDING" | "INACTIVE" | "DECLINED";

export interface MobilityWorkspace {
  workspace_id: string;
  workspace_name: string;
  is_owner: boolean;
  status: MobilityWorkspaceStatus;
}

export type MobilityDeviceState =
  | "CONNECTED"
  | "DISCONNECTED"
  | "ADOPTING"
  | "ADOPTING_TIMEOUT"
  | "DOWNLOADING"
  | "UPGRADING"
  | "RESTARTING"
  | "FACTORY_RESET"
  | "GETTING_READY"
  | "RESTORING"
  | "NULL"
  | "DELETING";

export interface MobilityDevice {
  id: string;
  name: string;
  model: "UMR" | "UMR Industrial" | "UMR Ultra";
  state: MobilityDeviceState;
  firmware_version: string;
  mac_address: string;
}

export interface MobilityDeviceLocation {
  latitude: number;
  longitude: number;
  last_updated: number;
}

/** Extiende MobilityDevice — ver el spec en developer.ui.com/mobility/v1.0.0. */
export interface MobilityDeviceDetail extends MobilityDevice {
  wan_source: "LTE" | "WAN" | "WIFIWAN" | "";
  wan_ip: string;
  enabled_wans: Array<"LTE" | "WAN" | "WIFIWAN">;
  isp: string;
  lte_signal_level: "NO_SIGNAL" | "POOR" | "FAIR" | "STRONG" | "";
  cellular_data_usage_bytes: number;
  /** -1 = sin límite. */
  cellular_data_limit_bytes: number;
  memory_usage_percent: number;
  /** 0 cuando state no es CONNECTED. */
  uptime_seconds: number;
  client_count: number;
  host_address: string;
  poe_passthrough: boolean;
  device_mode: "ROUTER" | "WANBRIDGE" | "LTEPASS";
  wifi_enabled: boolean;
  wifi_ssid: string;
  tx_power_level: "HIGH" | "MEDIUM" | "LOW" | "";
  vpn_profile_name: string;
  vpn_status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "FAILED" | "";
  subscription_plan: "FREE_TRIAL" | "1GB" | "5GB" | "20GB" | "2GB" | "CLOUD" | "";
  subscription_status: "ACTIVE" | "INACTIVE" | "PENDING" | "FAILED";
  /** Ausente (no null) si no hay fix de GPS. */
  location?: MobilityDeviceLocation;
}

export interface MobilityDeviceClient {
  mac: string;
  name: string;
  type: "WIRED" | "WIRELESS";
  connection_status: "ONLINE" | "OFFLINE" | "BLOCKED";
  ip_address: string;
  is_blocked: boolean;
  /** Ausente para clientes cableados. */
  wifi_experience?: number;
}

interface PagedEnvelope<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_LIMIT = 200;

/**
 * Cliente de solo lectura contra la API cloud de UniFi Mobility
 * (routers móviles/de viaje UMR), `https://api.ui.com`, auth por header
 * `X-API-Key` (scope `mobility`) — ver developer.ui.com/mobility/v1.0.0.
 *
 * A propósito NO implementa los PUT de escritura del spec (nombre del
 * device, LAN/DHCP, WiFi): esto es para "surface status", no control
 * remoto — mismo criterio que OPNsense antes de la decisión explícita de
 * habilitar escritura real.
 */
export class MobilityClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async requestJson<T>(path: string): Promise<T> {
    const res = await undiciFetch(`${this.baseUrl}${path}`, {
      headers: { "X-API-Key": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`UniFi Mobility API error en ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async requestAllPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;
    for (;;) {
      const sep = path.includes("?") ? "&" : "?";
      const page = await this.requestJson<PagedEnvelope<T>>(`${path}${sep}offset=${offset}&limit=${PAGE_LIMIT}`);
      results.push(...page.data);
      offset += page.data.length;
      if (page.data.length === 0 || offset >= page.total) break;
    }
    return results;
  }

  async listWorkspaces(): Promise<MobilityWorkspace[]> {
    return this.requestAllPages<MobilityWorkspace>("/v1/mobility/workspaces");
  }

  async listDevices(workspaceId: string): Promise<MobilityDevice[]> {
    return this.requestAllPages<MobilityDevice>(`/v1/mobility/workspaces/${workspaceId}/devices`);
  }

  /** Único endpoint que devuelve un objeto individual, no envuelto en `{data: [...], total, ...}`. */
  async getDeviceDetail(workspaceId: string, deviceId: string): Promise<MobilityDeviceDetail> {
    const envelope = await this.requestJson<{ data: MobilityDeviceDetail }>(
      `/v1/mobility/workspaces/${workspaceId}/devices/${deviceId}`
    );
    return envelope.data;
  }

  async listDeviceClients(workspaceId: string, deviceId: string): Promise<MobilityDeviceClient[]> {
    return this.requestAllPages<MobilityDeviceClient>(
      `/v1/mobility/workspaces/${workspaceId}/devices/${deviceId}/clients`
    );
  }
}

let instance: MobilityClient | null | undefined;

/** `undefined` = todavía no se intentó instanciar; `null` = no configurado (falta la API key). */
export function getMobilityClient(): MobilityClient | null {
  if (instance === undefined) {
    instance = env.UNIFI_MOBILITY_API_KEY ? new MobilityClient("https://api.ui.com", env.UNIFI_MOBILITY_API_KEY) : null;
  }
  return instance;
}
