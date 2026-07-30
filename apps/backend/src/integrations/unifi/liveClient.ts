import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";
import type { UnifiClient, WriteWifiNetworkInput } from "./client.js";
import { normalizeNode, normalizeWifiNetwork, normalizeAlert } from "./normalize.js";
import type { RawUnifiDevice, RawUnifiWlan, RawUnifiAlarm } from "./normalize.js";
import { env } from "../../config/env.js";

export interface UnifiLiveClientConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  site: string;
  verifyTls: boolean;
}

/**
 * Cliente HTTP contra la API clásica del UniFi Network Controller
 * (login por cookie + `/api/s/{site}/...`). No hay infraestructura real
 * disponible en este entorno para validar contra un controller de verdad
 * — antes de usar UNIFI_MODE=live en producción, correr pruebas de
 * integración manuales contra un sitio de staging.
 */
export class UnifiLiveClient implements UnifiClient {
  private baseUrl: string;
  private cookie: string | undefined;

  constructor(private config: UnifiLiveClientConfig) {
    const port = config.port ?? 443;
    this.baseUrl = `https://${config.host}:${port}`;
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.config.username, password: this.config.password }),
    });
    if (!res.ok) {
      throw new Error(`UniFi login falló: ${res.status} ${res.statusText}`);
    }
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error("UniFi login no devolvió cookie de sesión");
    }
    this.cookie = setCookie;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.cookie) {
      await this.login();
    }

    const doRequest = () =>
      fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          cookie: this.cookie ?? "",
          ...init?.headers,
        },
      });

    let res = await doRequest();
    if (res.status === 401) {
      // Sesión expirada: reintentar una vez tras re-login.
      await this.login();
      res = await doRequest();
    }
    if (!res.ok) {
      throw new Error(`UniFi API error en ${path}: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { data: T };
    return json.data;
  }

  async listNodes(sitio?: string): Promise<NetworkNode[]> {
    const site = sitio ?? this.config.site;
    const devices = await this.request<RawUnifiDevice[]>(`/api/s/${site}/stat/device`);
    return devices.map(normalizeNode);
  }

  async getNodeDetail(nodeId: string): Promise<NetworkNode | null> {
    const nodes = await this.listNodes();
    return nodes.find((n) => n.id === nodeId) ?? null;
  }

  async listWifiNetworks(sitio?: string): Promise<WifiNetwork[]> {
    const site = sitio ?? this.config.site;
    const wlans = await this.request<RawUnifiWlan[]>(`/api/s/${site}/rest/wlanconf`);
    return wlans.map(normalizeWifiNetwork);
  }

  async getWifiNetwork(sitio: string, ssid: string): Promise<WifiNetwork | null> {
    const networks = await this.listWifiNetworks(sitio);
    return networks.find((w) => w.ssid === ssid) ?? null;
  }

  async listAlerts(sitio?: string): Promise<Alert[]> {
    const site = sitio ?? this.config.site;
    const alarms = await this.request<RawUnifiAlarm[]>(`/api/s/${site}/stat/alarm`);
    return alarms.map(normalizeAlert);
  }

  /**
   * La API clásica de UniFi pide el MAC del dispositivo, no su `_id`
   * (`normalizeNode` no expone MAC hacia el resto del sistema a propósito
   * — es un detalle del proveedor, no del dominio — así que se busca acá).
   */
  async rebootNode(nodeId: string): Promise<void> {
    const site = this.config.site;
    const devices = await this.request<RawUnifiDevice[]>(`/api/s/${site}/stat/device`);
    const device = devices.find((d) => d._id === nodeId);
    if (!device) {
      throw new Error(`Dispositivo ${nodeId} no encontrado en UniFi (site ${site})`);
    }
    await this.request(`/api/s/${site}/cmd/devmgr`, {
      method: "POST",
      body: JSON.stringify({ cmd: "restart", mac: device.mac }),
    });
  }

  async writeWifiNetwork(input: WriteWifiNetworkInput): Promise<WifiNetwork> {
    const site = input.sitio;
    const existing = await this.request<RawUnifiWlan[]>(`/api/s/${site}/rest/wlanconf`);
    const match = existing.find((w) => w.name === input.ssid);

    const body = {
      name: input.ssid,
      vlan: input.vlanId,
      vlan_enabled: true,
    };

    if (match) {
      await this.request(`/api/s/${site}/rest/wlanconf/${match._id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    } else {
      await this.request(`/api/s/${site}/rest/wlanconf`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    const written = await this.getWifiNetwork(site, input.ssid);
    if (!written) {
      throw new Error(`No se pudo confirmar la escritura de la WLAN ${input.ssid} en ${site}`);
    }
    return written;
  }
}

export function createUnifiLiveClientFromEnv(): UnifiLiveClient {
  if (!env.UNIFI_HOST || !env.UNIFI_USERNAME || !env.UNIFI_PASSWORD) {
    throw new Error("UNIFI_MODE=live requiere UNIFI_HOST, UNIFI_USERNAME y UNIFI_PASSWORD");
  }
  return new UnifiLiveClient({
    host: env.UNIFI_HOST,
    port: env.UNIFI_PORT,
    username: env.UNIFI_USERNAME,
    password: env.UNIFI_PASSWORD,
    site: env.UNIFI_SITE,
    verifyTls: env.UNIFI_VERIFY_TLS,
  });
}
