import type {
  AtlasAlertsResponse,
  AtlasBuscarDocumentosResponse,
  AtlasBuscarResponse,
  AtlasClientTimeline,
  AtlasEnergia,
  AtlasEventsResponse,
  AtlasHealth,
  AtlasHistoryResponse,
  AtlasInventory,
  AtlasRfAnalysis,
  AtlasStatus,
  AtlasStatusNetwork,
  AtlasStatusProxmox,
  AtlasStatusUnifi,
  AtlasTelemetryNow,
  AtlasTrafficCliente,
  AtlasTrafficPuertos,
  AtlasTrafficTop,
  AtlasVersion,
} from "./types.js";

export interface AtlasEventsParams {
  /** 1-336 (14 días), default 24. Fuera de rango => 422. */
  horas?: number;
  kind?: string;
  /** default 200. No hay offset/cursor — si hay más eventos que esto, se pierden sin aviso. */
  limit?: number;
}

export interface AtlasAlertsParams {
  incluirCerradas?: boolean;
}

export interface AtlasHistoryParams {
  /** 1-336, default 6. */
  horas?: number;
  /** No valida: un valor inexistente da 200 con muestras:0, no error. */
  source?: string;
}

export interface AtlasTrafficParams {
  /** 1-720 (30 días). */
  horas?: number;
  limite?: number;
}

export interface AtlasClientTimelineParams {
  horas?: number;
}

export interface AtlasBuscarParams {
  q: string;
  limite?: number;
  origen?: string;
}

/**
 * Contrato del cliente de la API de ATLAS (21 rutas, ver `types.ts` y
 * `Operacion/DIKTYA_ATLAS_CONTRATO_API.md` en la entrega de Lucas del
 * 2026-08-10). Es la ÚNICA forma en que ARGOS debe conocer el estado de la
 * red — regla dura de arquitectura, ver `Atlas/ARGOS Arquitectura y Entrega
 * 2026-08-10.md`: nunca sondear UniFi/OPNsense/Proxmox directo.
 *
 * Todos los métodos devuelven la respuesta tal como la manda la API,
 * incluido cuando trae `ok:false` con HTTP 200 (adaptador que no pudo leer,
 * MAC/IP inexistente, `source` inválido) — el contrato es explícito en que
 * "HTTP 200 no significa que haya datos". Es responsabilidad del llamador
 * comprobar `ok`/campos vacíos, no de este cliente lanzar por eso.
 */
export interface AtlasClient {
  health(): Promise<AtlasHealth>;
  version(): Promise<AtlasVersion>;
  status(): Promise<AtlasStatus>;
  statusNetwork(): Promise<AtlasStatusNetwork>;
  statusUnifi(): Promise<AtlasStatusUnifi>;
  statusProxmox(): Promise<AtlasStatusProxmox>;
  inventory(): Promise<AtlasInventory>;
  events(params?: AtlasEventsParams): Promise<AtlasEventsResponse>;
  alerts(params?: AtlasAlertsParams): Promise<AtlasAlertsResponse>;
  history(params?: AtlasHistoryParams): Promise<AtlasHistoryResponse>;
  telemetryNow(): Promise<AtlasTelemetryNow>;
  rfAnalysis(): Promise<AtlasRfAnalysis>;
  energia(): Promise<AtlasEnergia>;
  clientTimeline(mac: string, params?: AtlasClientTimelineParams): Promise<AtlasClientTimeline>;
  trafficTop(params?: AtlasTrafficParams): Promise<AtlasTrafficTop>;
  trafficPuertos(params?: AtlasTrafficParams): Promise<AtlasTrafficPuertos>;
  trafficCliente(ip: string, params?: { horas?: number }): Promise<AtlasTrafficCliente>;
  buscar(params: AtlasBuscarParams): Promise<AtlasBuscarResponse>;
  buscarDocumentos(): Promise<AtlasBuscarDocumentosResponse>;
}

export interface AtlasHttpClientConfig {
  /** Ej. "10.100.25.245:8000" (VLAN 25, desde la VM de ARGOS) o "10.71.111.101:8000" (vía ZeroTier, desarrollo). */
  baseUrl: string;
  /**
   * Punto único de inyección de cabeceras — hoy la API no pide autenticación
   * (P-40), pero el contrato es explícito en que eso va a cambiar. Dejar
   * este hook desde el día uno es la diferencia entre "agregar una cabecera"
   * (media hora) y "reescribir todas las llamadas" (dos días).
   */
  headers?: Record<string, string>;
}

/**
 * Timeouts por categoría, medidos contra la API real el 2026-08-10 (§5 del
 * contrato). Los endpoints "EN VIVO" consultan los equipos en cada petición
 * y son mucho más lentos/variables que los que leen de Postgres — dimensionar
 * por varianza, no por el peor caso observado (`/energia` pasó de 5s a
 * 15s de peor caso medido en el mismo día).
 */
const TIMEOUT_ENERGIA_MS = 30_000;
const TIMEOUT_STATUS_PROXMOX_MS = 15_000;
const TIMEOUT_STATUS_MS = 10_000;
const TIMEOUT_DEFAULT_MS = 5_000;

export class AtlasHttpClient implements AtlasClient {
  private baseUrl: string;

  constructor(private config: AtlasHttpClientConfig) {
    this.baseUrl = `http://${config.baseUrl}`;
  }

  private async request<T>(path: string, timeoutMs: number, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const res = await fetch(url, {
      headers: this.config.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`ATLAS API error en ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async health(): Promise<AtlasHealth> {
    return this.request("/health", TIMEOUT_DEFAULT_MS);
  }

  async version(): Promise<AtlasVersion> {
    return this.request("/version", TIMEOUT_DEFAULT_MS);
  }

  async status(): Promise<AtlasStatus> {
    return this.request("/status", TIMEOUT_STATUS_MS);
  }

  async statusNetwork(): Promise<AtlasStatusNetwork> {
    return this.request("/status/network", TIMEOUT_STATUS_MS);
  }

  async statusUnifi(): Promise<AtlasStatusUnifi> {
    return this.request("/status/unifi", TIMEOUT_STATUS_MS);
  }

  async statusProxmox(): Promise<AtlasStatusProxmox> {
    return this.request("/status/proxmox", TIMEOUT_STATUS_PROXMOX_MS);
  }

  async inventory(): Promise<AtlasInventory> {
    return this.request("/inventory", TIMEOUT_DEFAULT_MS);
  }

  async events(params: AtlasEventsParams = {}): Promise<AtlasEventsResponse> {
    return this.request("/events", TIMEOUT_DEFAULT_MS, {
      horas: params.horas,
      kind: params.kind,
      limit: params.limit,
    });
  }

  async alerts(params: AtlasAlertsParams = {}): Promise<AtlasAlertsResponse> {
    return this.request("/alerts", TIMEOUT_DEFAULT_MS, {
      incluir_cerradas: params.incluirCerradas,
    });
  }

  async history(params: AtlasHistoryParams = {}): Promise<AtlasHistoryResponse> {
    return this.request("/history", TIMEOUT_DEFAULT_MS, {
      horas: params.horas,
      source: params.source,
    });
  }

  async telemetryNow(): Promise<AtlasTelemetryNow> {
    return this.request("/telemetry/now", TIMEOUT_DEFAULT_MS);
  }

  async rfAnalysis(): Promise<AtlasRfAnalysis> {
    return this.request("/rf/analysis", TIMEOUT_DEFAULT_MS);
  }

  async energia(): Promise<AtlasEnergia> {
    return this.request("/energia", TIMEOUT_ENERGIA_MS);
  }

  async clientTimeline(mac: string, params: AtlasClientTimelineParams = {}): Promise<AtlasClientTimeline> {
    return this.request(`/clients/${mac}/timeline`, TIMEOUT_DEFAULT_MS, { horas: params.horas });
  }

  async trafficTop(params: AtlasTrafficParams = {}): Promise<AtlasTrafficTop> {
    return this.request("/traffic/top", TIMEOUT_DEFAULT_MS, { horas: params.horas, limite: params.limite });
  }

  async trafficPuertos(params: AtlasTrafficParams = {}): Promise<AtlasTrafficPuertos> {
    return this.request("/traffic/puertos", TIMEOUT_DEFAULT_MS, { horas: params.horas, limite: params.limite });
  }

  async trafficCliente(ip: string, params: { horas?: number } = {}): Promise<AtlasTrafficCliente> {
    return this.request(`/traffic/cliente/${ip}`, TIMEOUT_DEFAULT_MS, { horas: params.horas });
  }

  async buscar(params: AtlasBuscarParams): Promise<AtlasBuscarResponse> {
    return this.request("/buscar", TIMEOUT_DEFAULT_MS, {
      q: params.q,
      limite: params.limite,
      origen: params.origen,
    });
  }

  async buscarDocumentos(): Promise<AtlasBuscarDocumentosResponse> {
    return this.request("/buscar/documentos", TIMEOUT_DEFAULT_MS);
  }
}
