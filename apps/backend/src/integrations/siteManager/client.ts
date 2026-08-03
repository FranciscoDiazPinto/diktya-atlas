import { fetch as undiciFetch } from "undici";
import { env } from "../../config/env.js";

export interface SiteManagerHost {
  id: string;
  hardwareId: string;
  type: string;
  ipAddress: string;
  owner: boolean;
  isBlocked: boolean;
  registrationTime: string;
  lastConnectionStateChange: string;
  latestBackupTime: string;
}

interface HostsPage {
  data: SiteManagerHost[];
  nextToken?: string;
}

/**
 * Cliente de solo lectura contra la API cloud de UniFi Site Manager
 * (`https://api.ui.com`, header `X-API-Key`, scope `site-manager`) — ver
 * developer.ui.com/site-manager/v1.0.0. Hoy solo `listHosts`: sirve para
 * descubrir el `id` de la consola real (ver GET /site-manager/hosts, ADMIN)
 * que hace falta para configurar UNIFI_SITE_MANAGER_HOST_ID y usar el Site
 * Manager Connector como transporte de integrations/unifiOs/
 * (UNIFI_INTEGRATION_TRANSPORT=connector).
 *
 * `/v1/devices` y el connector (`/v1/connector/consoles/{id}/*path`) no
 * viven acá: devices es "nice to have" (firmware/backup status) sin pedir
 * todavía, y el connector es un transporte de integrations/unifiOs/, no una
 * operación de este cliente — ver integrations/unifiOs/client.ts::viaConnector.
 */
export class SiteManagerClient {
  constructor(private apiKey: string) {}

  private async requestJson<T>(path: string): Promise<T> {
    const res = await undiciFetch(`https://api.ui.com${path}`, {
      headers: { "X-API-Key": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`UniFi Site Manager API error en ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /** Paginado por cursor (`nextToken`), a diferencia de Mobility/UniFi OS que usan offset/limit. */
  async listHosts(): Promise<SiteManagerHost[]> {
    const results: SiteManagerHost[] = [];
    let nextToken: string | undefined;
    do {
      const qs = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : "";
      const page = await this.requestJson<HostsPage>(`/v1/hosts${qs}`);
      results.push(...page.data);
      nextToken = page.nextToken || undefined;
    } while (nextToken);
    return results;
  }
}

let instance: SiteManagerClient | null | undefined;

/** `undefined` = todavía no se intentó instanciar; `null` = no configurado (falta la API key). */
export function getSiteManagerClient(): SiteManagerClient | null {
  if (instance === undefined) {
    instance = env.UNIFI_SITE_MANAGER_API_KEY ? new SiteManagerClient(env.UNIFI_SITE_MANAGER_API_KEY) : null;
  }
  return instance;
}
