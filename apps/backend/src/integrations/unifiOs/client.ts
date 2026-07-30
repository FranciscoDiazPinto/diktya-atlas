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
 * Cliente de solo lectura contra la API pública de integraciones de UniFi
 * OS (`/proxy/network/integration/v1/...`, auth por header X-API-KEY).
 *
 * A propósito NO implementa la interfaz `UnifiClient` (integrations/unifi/)
 * que usa el resto de la app: esta API real no expone WLANs ni alarmas —
 * confirmado con 404 "No endpoint" (no 403), o sea que no es un tema de
 * permisos del API key, la ruta directamente no existe en esta versión de
 * la API. Para esas dos cosas haría falta login por usuario/contraseña
 * contra la API clásica (`/api/auth/login`, existe pero no se usó por
 * decisión explícita de no crear una cuenta completa todavía).
 */
export class UnifiOsClient {
  private agent: Agent;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    verifyTls: boolean
  ) {
    this.agent = new Agent({ connect: { rejectUnauthorized: verifyTls } });
  }

  private async request<T>(path: string): Promise<T> {
    const res = await undiciFetch(`${this.baseUrl}${path}`, {
      headers: { "X-API-KEY": this.apiKey },
      dispatcher: this.agent,
    });
    if (!res.ok) {
      throw new Error(`UniFi OS API error en ${path}: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { data: T };
    return json.data;
  }

  async listSites(): Promise<UnifiOsSite[]> {
    return this.request<UnifiOsSite[]>("/proxy/network/integration/v1/sites");
  }

  async listDevices(siteId: string): Promise<UnifiOsDevice[]> {
    return this.request<UnifiOsDevice[]>(`/proxy/network/integration/v1/sites/${siteId}/devices`);
  }

  async listClients(siteId: string): Promise<UnifiOsConnectedClient[]> {
    return this.request<UnifiOsConnectedClient[]>(`/proxy/network/integration/v1/sites/${siteId}/clients`);
  }
}

let instance: UnifiOsClient | null | undefined;

/** `undefined` = todavía no se intentó instanciar; `null` = no configurado (falta host/key). */
export function getUnifiOsClient(): UnifiOsClient | null {
  if (instance === undefined) {
    instance =
      env.UNIFI_OS_HOST && env.UNIFI_API_KEY
        ? new UnifiOsClient(`https://${env.UNIFI_OS_HOST}`, env.UNIFI_API_KEY, env.UNIFI_OS_VERIFY_TLS)
        : null;
  }
  return instance;
}
