import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";

/**
 * Escritura que la Integration API no puede hacer de forma segura sin
 * intervención humana (crear un SSID o una VLAN nueva implica definir
 * seguridad WiFi / config de red que NetBot no gestiona — ver
 * liveClient.ts::writeWifiNetwork). El llamador (worker-remediation) la
 * distingue de un error genérico para crear un ticket de creación manual
 * en vez de reintentar el job.
 */
export class AutomatedWifiWriteNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface WriteWifiNetworkInput {
  sitio: string;
  ssid: string;
  vlanId: number;
  bandas: Array<"2.4GHz" | "5GHz" | "6GHz">;
}

/**
 * Contrato común para el módulo UniFi. `integrations/opnsense` implementa
 * la misma forma para las piezas que aplican (fase 2), de modo que
 * services/ y workers/ no necesiten saber contra qué proveedor están
 * hablando.
 *
 * IMPORTANTE: `writeWifiNetwork` hace la escritura real. Nunca se llama
 * directo desde el orquestador/chat — solo desde worker-remediation, y
 * siempre detrás del lock distribuido + verificación post-escritura
 * (ver services/lock.service.ts y services/writeVerification.service.ts).
 */
export interface UnifiClient {
  listNodes(sitio?: string): Promise<NetworkNode[]>;
  getNodeDetail(nodeId: string): Promise<NetworkNode | null>;
  listWifiNetworks(sitio?: string): Promise<WifiNetwork[]>;
  getWifiNetwork(sitio: string, ssid: string): Promise<WifiNetwork | null>;
  listAlerts(sitio?: string): Promise<Alert[]>;
  writeWifiNetwork(input: WriteWifiNetworkInput): Promise<WifiNetwork>;
  /**
   * Reinicio remoto de un dispositivo. Nunca se llama automático desde un
   * worker — solo desde routes/network.ts, detrás de rol y con
   * confirmación explícita del técnico en el frontend (ver
   * services/network.service.ts::rebootNode).
   */
  rebootNode(nodeId: string): Promise<void>;
}
