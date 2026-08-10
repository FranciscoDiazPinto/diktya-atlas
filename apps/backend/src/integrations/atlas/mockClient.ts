import type { AtlasClient, AtlasAlertsParams, AtlasEventsParams } from "./client.js";
import type {
  AtlasAlert,
  AtlasAlertsResponse,
  AtlasBuscarDocumentosResponse,
  AtlasBuscarResponse,
  AtlasClientTimeline,
  AtlasEnergia,
  AtlasEvent,
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

/**
 * Datos de ejemplo — red sana, HA emparejado 44/44, mismo shape que la
 * respuesta real medida el 2026-08-10 (ver `Atlas/ARGOS Arquitectura y
 * Entrega 2026-08-10.md`). Seedeable para que los tests puedan simular
 * degradación (mon-bb, alertas abiertas, carp con problemas, etc.).
 */
export class MockAtlasClient implements AtlasClient {
  private seededEvents: AtlasEvent[] = [];
  private alertsList: AtlasAlert[] = [];
  private statusOverride: Partial<AtlasStatus> = {};

  seedEvent(event: AtlasEvent) {
    this.seededEvents.push(event);
  }

  seedAlert(alert: AtlasAlert) {
    this.alertsList.push(alert);
  }

  setStatusOverride(override: Partial<AtlasStatus>) {
    this.statusOverride = override;
  }

  async health(): Promise<AtlasHealth> {
    return { status: "ok", node: "atlas-mon-aa", ts: new Date().toISOString() };
  }

  async version(): Promise<AtlasVersion> {
    return { app: "diktya-atlas", version: "0.3.0", milestone: "M3-telemetria" };
  }

  async status(): Promise<AtlasStatus> {
    const base: AtlasStatus = {
      node: "atlas-mon-aa",
      ts: new Date().toISOString(),
      ha_ok: true,
      carp: {
        ok: true,
        evaluable: true,
        total: 44,
        emparejadas: 44,
        invertidas: [],
        titular_perdido: false,
        maestras: { C1: 44, C2: 0 },
        vistas: { C1: 44, C2: 44 },
        resumen: "44/44 VIP emparejadas",
        detalle: { resumen: "44/44 VIP emparejadas", total: 44, emparejadas: 44, problemas: 0, titular_perdido: false, vips: [] },
        problemas: [],
      },
      unifi_ok: true,
      alertas_abiertas: this.alertsList.filter((a) => a.closed_at === null).length,
      alertas: this.alertsList.filter((a) => a.closed_at === null),
      network: {
        C1: { ok: true, ms: 174, carp_master: 44, carp_backup: 0, demotion: "0" },
        C2: { ok: true, ms: 318, carp_master: 0, carp_backup: 44, demotion: "0" },
        carp: {
          ok: true,
          evaluable: true,
          total: 44,
          emparejadas: 44,
          invertidas: [],
          titular_perdido: false,
          maestras: { C1: 44, C2: 0 },
          vistas: { C1: 44, C2: 44 },
          resumen: "44/44 VIP emparejadas",
          detalle: { resumen: "44/44 VIP emparejadas", total: 44, emparejadas: 44, problemas: 0, titular_perdido: false, vips: [] },
          problemas: [],
        },
      },
      unifi: {
        ok: true,
        ms: 509,
        total: 7,
        online: 7,
        devices: [
          { name: "DIKTYA-EFG-01", state: "ONLINE" },
          { name: "DIKTYA-SW-BB", state: "ONLINE" },
          { name: "DIKTYA-SW-AA", state: "ONLINE" },
          { name: "DIKTYA-CORE-FO-AA", state: "ONLINE" },
          { name: "DIKTYA-CORE-FO-BB", state: "ONLINE" },
          { name: "UPS 2U", state: "ONLINE" },
          { name: "U6 IW", state: "ONLINE" },
        ],
      },
    };
    return { ...base, ...this.statusOverride };
  }

  async statusNetwork(): Promise<AtlasStatusNetwork> {
    return (await this.status()).network;
  }

  async statusUnifi(): Promise<AtlasStatusUnifi> {
    return (await this.status()).unifi;
  }

  async statusProxmox(): Promise<AtlasStatusProxmox> {
    return {
      ok: true,
      latency_ms: 3503,
      nodos: {
        "SMV-01": {
          ok: true,
          uptime_h: 502.4,
          cpu_pct: 0.5,
          load1: "0.01",
          mem_pct: 19.3,
          mem_usada_gb: 4.5,
          mem_total_gb: 23.3,
          disco_pct: 11.4,
          pve: "9.2.2/mock",
          guests: [{ vmid: 240, nombre: "argos", tipo: "vm", estado: "running", uptime_h: 62.3, mem_mb: 1650 }],
          almacenes: [{ nombre: "local-lvm", libre_gb: 317.1, uso_pct: 9.1 }],
        },
      },
      _resumen: { nodos_ok: 1, guests: 1 },
    };
  }

  async inventory(): Promise<AtlasInventory> {
    return {
      equipos: [{ name: "DIKTYA-EFG-01", model: "Enterprise Fortress Gateway", state: "ONLINE", ip: "10.100.20.245", fw: "5.1.26", cpu_pct: 1.9, mem_pct: 73.1, uptime_s: 1_000_000 }],
      redes: [{ name: "Default", vlan: 1 }],
      clientes: 23,
    };
  }

  async events(params: AtlasEventsParams = {}): Promise<AtlasEventsResponse> {
    const filtered = params.kind ? this.seededEvents.filter((e) => e.kind === params.kind) : this.seededEvents;
    const limit = params.limit ?? 200;
    return { horas: params.horas ?? 24, total: filtered.length, eventos: filtered.slice(0, limit) };
  }

  async alerts(params: AtlasAlertsParams = {}): Promise<AtlasAlertsResponse> {
    const list = params.incluirCerradas ? this.alertsList : this.alertsList.filter((a) => a.closed_at === null);
    return { total: list.length, alertas: list };
  }

  async history(): Promise<AtlasHistoryResponse> {
    return { source: "unifi", horas: 6, muestras: 0, serie: [] };
  }

  async telemetryNow(): Promise<AtlasTelemetryNow> {
    return { fuentes: [] };
  }

  async rfAnalysis(): Promise<AtlasRfAnalysis> {
    return { radios: [], conflictos: [], retries_altos: [], veredicto: "ok" };
  }

  async energia(): Promise<AtlasEnergia> {
    return {
      latency_ms: 3586,
      ok: true,
      degradado: false,
      ups: {},
      fuentes: {},
      _resumen: { total: 0, en_bateria: 0, autonomia_min_minima: 0, alerta: false, degradado: false, fuentes_total: 0, fuentes_ok: 0, fuentes_caidas: [] },
    };
  }

  async clientTimeline(mac: string): Promise<AtlasClientTimeline> {
    return { mac, horas: 24, conectado_ahora: false, estado: null, roams: 0, reconexiones: 0, estabilidad: "estable", eventos: [] };
  }

  async trafficTop(): Promise<AtlasTrafficTop> {
    return { horas: 24, clientes: 0, total_mb: 0, top: [] };
  }

  async trafficPuertos(): Promise<AtlasTrafficPuertos> {
    return { horas: 24, puertos: [] };
  }

  async trafficCliente(ip: string): Promise<AtlasTrafficCliente> {
    return { cliente: ip, horas: 24, total_mb: 0, serie_horaria: [], principales_destinos: [] };
  }

  async buscar(params: { q: string }): Promise<AtlasBuscarResponse> {
    return { consulta: params.q, resultados: 0, coincidencias: [] };
  }

  async buscarDocumentos(): Promise<AtlasBuscarDocumentosResponse> {
    return { total: 0, documentos: [] };
  }
}
