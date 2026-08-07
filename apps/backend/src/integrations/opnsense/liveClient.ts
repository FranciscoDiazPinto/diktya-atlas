import { fetch as undiciFetch, Agent } from "undici";
import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";
import type { OpnsenseClient } from "./client.js";
import { notImplemented } from "./client.js";
import { env } from "../../config/env.js";

export interface OpnsenseLiveClientConfig {
  host: string;
  apiKey: string;
  apiSecret: string;
  verifyTls: boolean;
}

interface OpnsenseSystemInformation {
  name: string;
  versions: string[];
}

/**
 * Un item por gateway monitoreado (WANs + rutas HA entre CORE-01/CORE-02).
 * `status` son los códigos internos de dpinger: "none" = ok; "down",
 * "loss", "delay", "force_down" = degradado en algún grado — solo se vio
 * "none" contra la infra real hasta ahora (2026-08-07, los 3 WAN +
 * respaldo + ruta a CORE-02 todos "Online"), así que el resto de los
 * valores es inferencia de la documentación de OPNsense, no verificación
 * contra un caso real caído.
 */
interface OpnsenseGatewayStatusItem {
  name: string;
  status: string;
  status_translated: string;
  loss: string;
  delay: string;
}

interface OpnsenseGatewayStatusResponse {
  items: OpnsenseGatewayStatusItem[];
}

/**
 * Fase 2, alcance reducido a lo que `opnsense.service.ts::getOpnsenseStatusSummary`
 * consulta hoy: `listNodes` + `listAlerts`, vía la API REST nativa de OPNsense
 * (Basic Auth, key:secret generado en Sistema > Acceso > Usuarios > API Keys —
 * sin relación con la Integration API de UniFi). Validado en vivo contra
 * CORE-01 el 2026-08-07 (`GET /api/core/firmware/status` y
 * `/api/routes/gateway/status` devuelven datos reales).
 *
 * Solo representa **CORE-01** — es el único host con key configurada. CORE-02
 * (BACKUP) no aparece como nodo propio todavía: fingir su estado sin una
 * conexión real a él violaría el mismo principio que ya sigue
 * `OpnsenseClientStub` (nunca simular datos). La ruta hacia CORE-02
 * (`GW_CORE02_V20`, VLAN 20) sí se refleja como alerta si esa ruta específica
 * se degrada.
 *
 * `listWifiNetworks`/`getWifiNetwork`/`writeWifiNetwork`/`rebootNode` siguen
 * sin implementar a propósito — no hay diseño todavía de qué significaría
 * "reglas de firewall/VLAN" en términos de esta interfaz pensada para
 * SSIDs de UniFi, y escribir contra el firewall real no es parte de este
 * alcance (solo lectura).
 */
export class OpnsenseLiveClient implements OpnsenseClient {
  private baseUrl: string;
  private authHeader: string;
  private agent: Agent;

  constructor(private config: OpnsenseLiveClientConfig) {
    this.baseUrl = `https://${config.host}`;
    this.authHeader = `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;
    this.agent = new Agent({ connect: { rejectUnauthorized: config.verifyTls } });
  }

  private async request<T>(path: string): Promise<T> {
    const res = await undiciFetch(`${this.baseUrl}${path}`, {
      headers: { authorization: this.authHeader },
      dispatcher: this.agent,
    });
    if (!res.ok) {
      throw new Error(`OPNsense API error en ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async listNodes(): Promise<NetworkNode[]> {
    const info = await this.request<OpnsenseSystemInformation>("/api/diagnostics/system/systeminformation");
    return [
      {
        id: "core-01",
        sitio: "core",
        nombre: info.name || "CORE-01",
        modelo: info.versions?.[0] ?? "OPNsense",
        tipoDispositivo: "GATEWAY",
        status: "online",
        clientesConectados: 0,
        ultimaVezVisto: new Date().toISOString(),
        ssidsTransmitidos: [],
      },
    ];
  }

  async getNodeDetail(nodeId: string): Promise<NetworkNode | null> {
    const nodes = await this.listNodes();
    return nodes.find((n) => n.id === nodeId) ?? null;
  }

  async listWifiNetworks(): Promise<WifiNetwork[]> {
    return notImplemented("listWifiNetworks");
  }

  async getWifiNetwork(): Promise<WifiNetwork | null> {
    return notImplemented("getWifiNetwork");
  }

  async writeWifiNetwork(): Promise<WifiNetwork> {
    return notImplemented("writeWifiNetwork");
  }

  async rebootNode(): Promise<void> {
    return notImplemented("rebootNode");
  }

  async listAlerts(): Promise<Alert[]> {
    const gw = await this.request<OpnsenseGatewayStatusResponse>("/api/routes/gateway/status");
    const creadoEn = new Date().toISOString();
    return gw.items
      .filter((item) => item.status !== "none")
      .map((item) => ({
        id: `opnsense-gw-${item.name}`,
        sitio: "core",
        nodeId: "core-01",
        severidad: item.status === "down" || item.status === "force_down" ? "CRITICO" : "ADVERTENCIA",
        mensaje: `Gateway ${item.name} degradado: ${item.status_translated} (pérdida ${item.loss})`,
        creadoEn,
      }));
  }
}

export function createOpnsenseLiveClientFromEnv(): OpnsenseLiveClient {
  // env.ts ya valida esto (fail-fast) al arrancar si OPNSENSE_MODE=live —
  // se repite acá por el mismo motivo que createUnifiLiveClientFromEnv:
  // esta función es alcanzable sin volver a pasar por loadEnv().
  const missing = (["OPNSENSE_HOST", "OPNSENSE_API_KEY", "OPNSENSE_API_SECRET"] as const).filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`OPNSENSE_MODE=live requiere: ${missing.join(", ")}`);
  }
  return new OpnsenseLiveClient({
    host: env.OPNSENSE_HOST!,
    apiKey: env.OPNSENSE_API_KEY!,
    apiSecret: env.OPNSENSE_API_SECRET!,
    verifyTls: env.OPNSENSE_VERIFY_TLS,
  });
}
