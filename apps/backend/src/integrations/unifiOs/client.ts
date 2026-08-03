import { fetch as undiciFetch, Agent } from "undici";
import { env } from "../../config/env.js";

export interface UnifiOsSite {
  id: string;
  name: string;
  internalReference: string;
}

export interface UnifiOsDevice {
  id: string;
  macAddress: string;
  ipAddress: string;
  name: string;
  model: string;
  state: string;
  firmwareVersion: string;
  features: Array<"switching" | "accessPoint" | "gateway">;
}

export interface UnifiOsDeviceLatestStatistics {
  uptimeSec?: number;
  lastHeartbeatAt?: string;
}

export interface UnifiOsPendingDevice {
  macAddress: string;
  model: string;
  ipAddress: string;
  state: string;
  features: Array<"switching" | "accessPoint" | "gateway">;
  /** Sitios a los que este device puede adoptarse — verificar que incluya el nuestro antes de intentar. */
  adoptionTargetSiteIds: string[];
}

export interface UnifiOsConnectedClient {
  id: string;
  type: string;
  name: string;
  macAddress: string;
  connectedAt: string;
  uplinkDeviceId?: string;
}

/**
 * Solo el caso `DEVICES` (lista explícita de device ids) se usa hoy — ver
 * normalizeIntegrationDevice. `DEVICE_TAGS` requeriría resolver tags vía
 * `GET .../device-tags`, que no se implementó (no hay necesidad real
 * todavía) — un broadcast filtrado por tag simplemente no aporta su SSID a
 * `ssidsTransmitidos` de ningún device.
 */
export type UnifiOsBroadcastingDeviceFilter =
  | { type: "DEVICES"; deviceIds: string[] }
  | { type: "DEVICE_TAGS" };

export interface UnifiOsNetworkOverview {
  id: string;
  name: string;
  vlanId: number;
  default: boolean;
}

export type UnifiOsWifiNetworkReference = { type: "NATIVE" } | { type: "SPECIFIC"; networkId: string };

export interface UnifiOsWifiBroadcastOverview {
  id: string;
  name: string;
  /**
   * Ausente cuando el broadcast usa la red nativa/por defecto — confirmado
   * contra un UDM real (ver normalizeIntegrationWifiBroadcast, que lo trata
   * igual que `{type: "NATIVE"}`), aunque el OpenAPI spec no lo marcaba como
   * opcional.
   */
  network?: UnifiOsWifiNetworkReference;
  /** Ausente en variantes no-STANDARD (ej. IOT_OPTIMIZED). */
  broadcastingFrequenciesGHz?: number[];
  /** `null`/ausente = se transmite desde todos los devices AP-capable. */
  broadcastingDeviceFilter?: UnifiOsBroadcastingDeviceFilter | null;
}

/**
 * Forma completa de un WiFi Broadcast (GET detail / PUT). A propósito no se
 * tipa campo a campo (decenas de sub-objetos discriminados por `type`) —
 * `writeWifiNetwork` en liveClient.ts la trata como passthrough: la lee
 * completa y la reenvía casi intacta, porque el PUT de esta API exige el
 * objeto entero (no hace merge parcial como la API clásica).
 */
export type UnifiOsWifiBroadcastDetail = Record<string, unknown> & { id: string; name: string };

interface PagedResponse<T> {
  data: T[];
  offset: number;
  limit: number;
  totalCount: number;
}

/**
 * El Site Manager Connector (`https://api.ui.com/v1/connector/consoles/{id}/*path`)
 * reenvía `*path` a `http://127.0.0.1/proxy/{*path}` DENTRO de la consola —
 * como nuestros paths ya incluyen el `/proxy` (pensados para pegarle directo
 * al host, ver modo `direct`), hay que sacárselo antes de armar la URL del
 * connector o el proxy queda duplicado (`/proxy/proxy/...`, 404).
 */
export function stripProxyPrefix(path: string): string {
  return path.replace(/^\/proxy/, "");
}

/**
 * Cliente contra la API pública de integraciones de UniFi OS
 * (`/proxy/network/integration/v1/...`, auth por header X-API-KEY).
 *
 * A propósito NO implementa la interfaz `UnifiClient` (integrations/unifi/)
 * que usa el resto de la app: esta API real no expone alarmas — confirmado
 * con 404 "No endpoint" (no 403), o sea que no es un tema de permisos del
 * API key, la ruta directamente no existe en esta versión de la API. Para
 * eso haría falta login por usuario/contraseña contra la API clásica
 * (`/api/auth/login`, existe pero no se usó por decisión explícita de no
 * crear una cuenta completa todavía).
 *
 * WLANs sí están acá (como "WiFi Broadcasts", ver integrations/unifi/liveClient.ts
 * ::writeWifiNetwork) — el nombre cambió respecto a la API clásica, no falta
 * el endpoint.
 *
 * Dos transportes posibles (constructor privado — usar los factories):
 * - `direct`: pega directo contra la consola (requiere alcance de red — hoy
 *   un port-forward no oficial en CORE-01, ver Atlas/Rutas de Red.md, caído
 *   mientras el Starlink no tenga IP). TLS relajado (cert self-signed).
 * - `viaConnector`: pega vía el Site Manager Connector (`api.ui.com`), sin
 *   necesitar alcance de red directo — mismos paths (Integration API), cert
 *   público válido (sin `Agent` custom), le saca el `/proxy` a cada path
 *   antes de pedirlo (ver `stripProxyPrefix`).
 */
export class UnifiOsClient {
  private constructor(
    private baseUrl: string,
    private apiKey: string,
    private headerName: "X-API-KEY" | "X-API-Key",
    private agent: Agent | undefined,
    private stripProxy: boolean
  ) {}

  static direct(host: string, apiKey: string, verifyTls: boolean): UnifiOsClient {
    return new UnifiOsClient(
      `https://${host}`,
      apiKey,
      "X-API-KEY",
      new Agent({ connect: { rejectUnauthorized: verifyTls } }),
      false
    );
  }

  static viaConnector(hostId: string, apiKey: string): UnifiOsClient {
    return new UnifiOsClient(`https://api.ui.com/v1/connector/consoles/${hostId}`, apiKey, "X-API-Key", undefined, true);
  }

  private resolvePath(path: string): string {
    return this.stripProxy ? stripProxyPrefix(path) : path;
  }

  private async requestJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await undiciFetch(`${this.baseUrl}${this.resolvePath(path)}`, {
      method: init?.method ?? "GET",
      headers: {
        [this.headerName]: this.apiKey,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      dispatcher: this.agent,
    });
    if (!res.ok) {
      throw new Error(`UniFi OS API error en ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const json = await this.requestJson<{ data: T }>(path, init);
    return json.data;
  }

  /** Para endpoints de acción que no devuelven cuerpo (ej. reboot). */
  private async requestVoid(path: string, init?: { method?: string; body?: unknown }): Promise<void> {
    const res = await undiciFetch(`${this.baseUrl}${this.resolvePath(path)}`, {
      method: init?.method ?? "GET",
      headers: {
        [this.headerName]: this.apiKey,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      dispatcher: this.agent,
    });
    if (!res.ok) {
      throw new Error(`UniFi OS API error en ${path}: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * Los endpoints de listado paginan (default limit 25, máximo 200) — un
   * sitio con muchas WLANs/redes fácilmente supera eso, así que se recorren
   * todas las páginas en vez de asumir que la primera trae todo.
   */
  private async requestAllPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;
    const limit = 200;
    for (;;) {
      const sep = path.includes("?") ? "&" : "?";
      const page = await this.requestJson<PagedResponse<T>>(`${path}${sep}offset=${offset}&limit=${limit}`);
      results.push(...page.data);
      offset += page.data.length;
      if (page.data.length === 0 || offset >= page.totalCount) break;
    }
    return results;
  }

  async listSites(): Promise<UnifiOsSite[]> {
    return this.request<UnifiOsSite[]>("/proxy/network/integration/v1/sites");
  }

  async resolveSiteId(siteName: string): Promise<string> {
    const sites = await this.listSites();
    const site = sites.find((s) => s.internalReference === siteName);
    if (!site) {
      throw new Error(`UniFi OS no reporta ningún sitio con nombre interno "${siteName}"`);
    }
    return site.id;
  }

  async listDevices(siteId: string): Promise<UnifiOsDevice[]> {
    return this.requestAllPages<UnifiOsDevice>(`/proxy/network/integration/v1/sites/${siteId}/devices`);
  }

  /** A diferencia de listDevices, NO está bajo /sites/{siteId} — un device pendiente todavía no pertenece a ningún sitio. */
  async listPendingDevices(): Promise<UnifiOsPendingDevice[]> {
    return this.requestAllPages<UnifiOsPendingDevice>("/proxy/network/integration/v1/pending-devices");
  }

  /**
   * Re-adopta un device que ya perteneció al sitio y volvió a aparecer como
   * pendiente (ej. tras un power-cycle que perdió su config de inform URL).
   * `ignoreDeviceLimit: false` a propósito — si el sitio está en el límite
   * de licencias, preferimos que falle explícito antes que forzarlo en
   * silencio (mismo criterio que el resto de las escrituras automáticas de
   * este cliente, ver writeWifiNetwork).
   */
  async adoptDevice(siteId: string, macAddress: string): Promise<UnifiOsDevice> {
    // Sin confirmar contra hardware real (no se puede probar sin desconectar
    // un device real a propósito) — se asume "objeto directo, no envuelto",
    // igual que el resto de los endpoints de recurso singular de esta API
    // (getWifiBroadcastDetail/updateWifiBroadcast), a diferencia de los
    // listados paginados que sí envuelven en {data:...}.
    return this.requestJson<UnifiOsDevice>(`/proxy/network/integration/v1/sites/${siteId}/devices`, {
      method: "POST",
      body: { macAddress, ignoreDeviceLimit: false },
    });
  }

  async listClients(siteId: string): Promise<UnifiOsConnectedClient[]> {
    return this.requestAllPages<UnifiOsConnectedClient>(`/proxy/network/integration/v1/sites/${siteId}/clients`);
  }

  /** GET de recurso individual: objeto directo, no envuelto en `{data:...}`. */
  async getDeviceLatestStatistics(siteId: string, deviceId: string): Promise<UnifiOsDeviceLatestStatistics> {
    return this.requestJson<UnifiOsDeviceLatestStatistics>(
      `/proxy/network/integration/v1/sites/${siteId}/devices/${deviceId}/statistics/latest`
    );
  }

  async executeDeviceAction(siteId: string, deviceId: string, action: "RESTART"): Promise<void> {
    return this.requestVoid(`/proxy/network/integration/v1/sites/${siteId}/devices/${deviceId}/actions`, {
      method: "POST",
      body: { action },
    });
  }

  async listNetworks(siteId: string): Promise<UnifiOsNetworkOverview[]> {
    return this.requestAllPages<UnifiOsNetworkOverview>(`/proxy/network/integration/v1/sites/${siteId}/networks`);
  }

  async listWifiBroadcasts(siteId: string): Promise<UnifiOsWifiBroadcastOverview[]> {
    return this.requestAllPages<UnifiOsWifiBroadcastOverview>(
      `/proxy/network/integration/v1/sites/${siteId}/wifi/broadcasts`
    );
  }

  /**
   * A diferencia de los listados (que envuelven en `{data: [...]}`), el GET
   * de un recurso individual devuelve el objeto directo — confirmado contra
   * un UDM real. Por eso usa `requestJson` (sin desenvolver `.data`), no
   * `request`.
   */
  async getWifiBroadcastDetail(siteId: string, broadcastId: string): Promise<UnifiOsWifiBroadcastDetail> {
    return this.requestJson<UnifiOsWifiBroadcastDetail>(
      `/proxy/network/integration/v1/sites/${siteId}/wifi/broadcasts/${broadcastId}`
    );
  }

  /** Mismo caso que getWifiBroadcastDetail: el PUT devuelve el objeto directo. */
  async updateWifiBroadcast(
    siteId: string,
    broadcastId: string,
    body: Record<string, unknown>
  ): Promise<UnifiOsWifiBroadcastDetail> {
    return this.requestJson<UnifiOsWifiBroadcastDetail>(
      `/proxy/network/integration/v1/sites/${siteId}/wifi/broadcasts/${broadcastId}`,
      { method: "PUT", body }
    );
  }
}

let instance: UnifiOsClient | null | undefined;

/**
 * `undefined` = todavía no se intentó instanciar; `null` = no configurado
 * (según UNIFI_INTEGRATION_TRANSPORT, falta host/key o falta la config del
 * connector — ver env.ts).
 */
export function getUnifiOsClient(): UnifiOsClient | null {
  if (instance === undefined) {
    if (env.UNIFI_INTEGRATION_TRANSPORT === "connector") {
      instance =
        env.UNIFI_SITE_MANAGER_HOST_ID && env.UNIFI_SITE_MANAGER_API_KEY
          ? UnifiOsClient.viaConnector(env.UNIFI_SITE_MANAGER_HOST_ID, env.UNIFI_SITE_MANAGER_API_KEY)
          : null;
    } else {
      instance =
        env.UNIFI_OS_HOST && env.UNIFI_API_KEY
          ? UnifiOsClient.direct(env.UNIFI_OS_HOST, env.UNIFI_API_KEY, env.UNIFI_OS_VERIFY_TLS)
          : null;
    }
  }
  return instance;
}
