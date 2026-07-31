import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";
import { AutomatedWifiWriteNotSupportedError } from "./client.js";
import type { UnifiClient, WriteWifiNetworkInput } from "./client.js";
import {
  normalizeAlert,
  normalizeIntegrationWifiBroadcast,
  normalizeIntegrationDevice,
  mapBandToGhz,
} from "./normalize.js";
import type { RawUnifiAlarm } from "./normalize.js";
import type { UnifiOsClient } from "../unifiOs/client.js";
import { env } from "../../config/env.js";

export interface UnifiLiveClientConfig {
  /**
   * Credenciales clásicas — opcionales a propósito. Usadas solo por
   * `listAlerts` (la única función que sigue en la API clásica, ver
   * comentario de clase); nada en la app llama a esa función hoy. No se
   * creó una cuenta local clásica en el UDM real por decisión explícita
   * (ver Atlas/Infraestructura Real.md) — exigirlas bloquearía
   * UNIFI_MODE=live por completo para una función que nunca se usa.
   */
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  site: string;
  verifyTls: boolean;
  /** Credenciales de la Integration API (X-API-KEY) — usadas para WLANs, nodos y reboot. */
  integrationHost: string;
  integrationApiKey: string;
  integrationVerifyTls: boolean;
}

/**
 * Cliente HTTP contra UniFi. La mayoría de los métodos (nodos, WLANs,
 * reboot) pasan por la Integration API pública (`integrations/unifiOs/`,
 * auth X-API-KEY) — verificada contra un UDM real (ver
 * liveClient.ts::writeWifiNetwork y el historial de este archivo para el
 * porqué de esa migración: la API clásica asume un controller self-hosted,
 * y un UDM real corre UniFi OS, con rutas distintas).
 *
 * `listAlerts` es la única excepción: sigue en la API clásica (login por
 * cookie + `/api/s/{site}/...`) porque la Integration API no expone
 * alarmas todavía (404 "No endpoint", no 403 — no es permisos). Nunca se
 * validó contra infra real — si hace falta en producción, probable que
 * tenga el mismo problema de rutas que tenían nodos/WLANs antes de esta
 * migración.
 */
export class UnifiLiveClient implements UnifiClient {
  private baseUrl: string;
  private cookie: string | undefined;
  private integrationClientPromise: Promise<UnifiOsClient> | undefined;
  private integrationSiteId: string | undefined;

  constructor(private config: UnifiLiveClientConfig) {
    const port = config.port ?? 443;
    // Puede quedar apuntando a "https://undefined:443" si no hay host clásico
    // configurado — inofensivo: nada lo usa hasta que se llame listAlerts,
    // que falla explícito en login() antes de intentar el fetch.
    this.baseUrl = `https://${config.host}:${port}`;
  }

  /**
   * Import dinámico a propósito: `unifiOs/client.ts` carga `undici`, y
   * `integrations/unifi/index.ts` importa este archivo de forma estática
   * sin importar el modo (mock/live) — si el import de UnifiOsClient fuera
   * estático acá, cualquier código que solo toque `getUnifiClient()` en
   * modo mock (todos los tests) cargaría `undici` igual. Con import()
   * perezoso, ese módulo solo se carga si de verdad se llega a usar la
   * Integration API (modo live).
   */
  private async getIntegrationClient(): Promise<UnifiOsClient> {
    if (!this.integrationClientPromise) {
      this.integrationClientPromise = import("../unifiOs/client.js").then(
        ({ UnifiOsClient }) =>
          new UnifiOsClient(
            `https://${this.config.integrationHost}`,
            this.config.integrationApiKey,
            this.config.integrationVerifyTls
          )
      );
    }
    return this.integrationClientPromise;
  }

  private async getIntegrationSiteId(): Promise<string> {
    if (!this.integrationSiteId) {
      const client = await this.getIntegrationClient();
      this.integrationSiteId = await client.resolveSiteId(this.config.site);
    }
    return this.integrationSiteId;
  }

  private async login(): Promise<void> {
    if (!this.config.host || !this.config.username || !this.config.password) {
      throw new Error(
        "listAlerts requiere credenciales clásicas (UNIFI_HOST/UNIFI_USERNAME/UNIFI_PASSWORD), no configuradas — decisión explícita de no crear esa cuenta en el UDM real, ver Atlas/Infraestructura Real.md"
      );
    }
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

  /**
   * `uptimeSegundos`/`ultimaVezVisto` requieren una llamada de estadísticas
   * por device (la Integration API no las trae en el listado bulk) — N+1,
   * aceptable acá porque esto alimenta un poll periódico (worker-monitor)
   * sobre un puñado de dispositivos reales, no una ruta HTTP de alto
   * tráfico. Si un device individual falla (ej. offline sin stats
   * recientes), no tira abajo el resto del listado.
   */
  async listNodes(sitio?: string): Promise<NetworkNode[]> {
    const site = sitio ?? this.config.site;
    const [integrationClient, siteId] = await Promise.all([this.getIntegrationClient(), this.getIntegrationSiteId()]);
    const [devices, clients, broadcasts] = await Promise.all([
      integrationClient.listDevices(siteId),
      integrationClient.listClients(siteId),
      integrationClient.listWifiBroadcasts(siteId),
    ]);

    const clientCountByDeviceId = new Map<string, number>();
    for (const c of clients) {
      if (!c.uplinkDeviceId) continue;
      clientCountByDeviceId.set(c.uplinkDeviceId, (clientCountByDeviceId.get(c.uplinkDeviceId) ?? 0) + 1);
    }

    const apCapableDeviceIds = devices.filter((d) => d.features.includes("accessPoint")).map((d) => d.id);
    const ssidsByDeviceId = new Map<string, string[]>();
    for (const b of broadcasts) {
      const filter = b.broadcastingDeviceFilter;
      // Sin filtro: se transmite desde todos los devices AP-capable.
      // `DEVICE_TAGS`: no resuelto (ver comentario en unifiOs/client.ts),
      // ese SSID simplemente no aparece en ningún device.
      const targetIds = !filter ? apCapableDeviceIds : filter.type === "DEVICES" ? filter.deviceIds : [];
      for (const id of targetIds) {
        const list = ssidsByDeviceId.get(id) ?? [];
        list.push(b.name);
        ssidsByDeviceId.set(id, list);
      }
    }

    const stats = await Promise.all(
      devices.map((d) => integrationClient.getDeviceLatestStatistics(siteId, d.id).catch(() => undefined))
    );

    return devices.map((d, i) =>
      normalizeIntegrationDevice(
        d,
        site,
        stats[i],
        clientCountByDeviceId.get(d.id) ?? 0,
        ssidsByDeviceId.get(d.id) ?? []
      )
    );
  }

  async getNodeDetail(nodeId: string): Promise<NetworkNode | null> {
    const nodes = await this.listNodes();
    return nodes.find((n) => n.id === nodeId) ?? null;
  }

  async listWifiNetworks(sitio?: string): Promise<WifiNetwork[]> {
    const site = sitio ?? this.config.site;
    const [integrationClient, siteId] = await Promise.all([this.getIntegrationClient(), this.getIntegrationSiteId()]);
    const [broadcasts, networks] = await Promise.all([
      integrationClient.listWifiBroadcasts(siteId),
      integrationClient.listNetworks(siteId),
    ]);
    const vlanIdByNetworkId = new Map(networks.map((n) => [n.id, n.vlanId]));
    const defaultVlanId = networks.find((n) => n.default)?.vlanId ?? 1;
    return broadcasts.map((b) => normalizeIntegrationWifiBroadcast(b, site, vlanIdByNetworkId, defaultVlanId));
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

  async rebootNode(nodeId: string): Promise<void> {
    const [integrationClient, siteId] = await Promise.all([this.getIntegrationClient(), this.getIntegrationSiteId()]);
    await integrationClient.executeDeviceAction(siteId, nodeId, "RESTART");
  }

  /**
   * Fuera del contrato `UnifiClient` a propósito: re-adopción es un
   * concepto específico de UniFi (dispositivos WiFi/red) sin equivalente en
   * OPNsense, que implementa la misma interfaz — ver
   * services/autoRemediation.service.ts, el único llamador, que hace
   * `instanceof UnifiLiveClient` antes de usar estos dos métodos.
   */
  async listPendingDevices() {
    const integrationClient = await this.getIntegrationClient();
    return integrationClient.listPendingDevices();
  }

  /** Re-adopta por MAC (no por id — un device pendiente todavía no tiene id de sitio). Devuelve el nodo ya normalizado. */
  async adoptDevice(macAddress: string): Promise<NetworkNode> {
    const [integrationClient, siteId] = await Promise.all([this.getIntegrationClient(), this.getIntegrationSiteId()]);
    const device = await integrationClient.adoptDevice(siteId, macAddress);
    return normalizeIntegrationDevice(device, this.config.site, undefined, 0, []);
  }

  /**
   * Reasigna la VLAN de un SSID ya existente vía la Integration API. NO crea
   * SSIDs ni redes (Networks) nuevas: el PUT de esta API exige el objeto
   * completo (incluida `securityConfiguration`), y NetBot no tiene de dónde
   * sacar una seguridad WiFi válida para una WLAN que no existía — inventar
   * una (ej. abrirla sin contraseña) sería una regresión de seguridad
   * silenciosa. Si el SSID o la VLAN destino no existen todavía, se lanza
   * `AutomatedWifiWriteNotSupportedError` para que el llamador
   * (worker-remediation) cree un ticket de creación manual en vez de
   * reintentar o improvisar una config.
   */
  async writeWifiNetwork(input: WriteWifiNetworkInput): Promise<WifiNetwork> {
    const [integrationClient, siteId] = await Promise.all([this.getIntegrationClient(), this.getIntegrationSiteId()]);

    const broadcasts = await integrationClient.listWifiBroadcasts(siteId);
    const broadcast = broadcasts.find((b) => b.name === input.ssid);
    if (!broadcast) {
      throw new AutomatedWifiWriteNotSupportedError(
        `El SSID "${input.ssid}" no existe todavía en el sitio ${input.sitio}. NetBot solo reasigna VLAN de WLANs ya creadas (crear una WLAN nueva implica definir su seguridad, algo que no se automatiza) — crearla manualmente en la consola UniFi y volver a aplicar el plan.`
      );
    }

    const networks = await integrationClient.listNetworks(siteId);
    const targetNetwork = networks.find((n) => n.vlanId === input.vlanId);
    if (!targetNetwork) {
      throw new AutomatedWifiWriteNotSupportedError(
        `No existe una red con VLAN ${input.vlanId} en el sitio ${input.sitio}. NetBot no crea redes nuevas automáticamente — crearla manualmente en la consola UniFi y volver a aplicar el plan.`
      );
    }

    const detail = await integrationClient.getWifiBroadcastDetail(siteId, broadcast.id);
    const { id, metadata, ...body } = detail;
    void id;
    void metadata;

    await integrationClient.updateWifiBroadcast(siteId, broadcast.id, {
      ...body,
      broadcastingFrequenciesGHz: input.bandas.map(mapBandToGhz),
      network: { type: "SPECIFIC", networkId: targetNetwork.id },
    });

    return {
      id: broadcast.id,
      sitio: input.sitio,
      ssid: input.ssid,
      vlanId: input.vlanId,
      bandas: input.bandas,
      clientesConectados: 0,
    };
  }
}

export function createUnifiLiveClientFromEnv(): UnifiLiveClient {
  if (!env.UNIFI_OS_HOST || !env.UNIFI_API_KEY) {
    throw new Error("UNIFI_MODE=live requiere UNIFI_OS_HOST y UNIFI_API_KEY (WLANs/nodos/reboot vía Integration API)");
  }
  // UNIFI_HOST/USERNAME/PASSWORD (API clásica) son opcionales — ver
  // UnifiLiveClientConfig, solo los usa listAlerts, que nada llama hoy.
  return new UnifiLiveClient({
    host: env.UNIFI_HOST,
    port: env.UNIFI_PORT,
    username: env.UNIFI_USERNAME,
    password: env.UNIFI_PASSWORD,
    site: env.UNIFI_SITE,
    verifyTls: env.UNIFI_VERIFY_TLS,
    integrationHost: env.UNIFI_OS_HOST,
    integrationApiKey: env.UNIFI_API_KEY,
    integrationVerifyTls: env.UNIFI_OS_VERIFY_TLS,
  });
}
