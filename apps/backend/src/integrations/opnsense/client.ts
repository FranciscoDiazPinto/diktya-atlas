import type { UnifiClient } from "../unifi/client.js";

/**
 * Fase 2. Mismo contrato de dominio que UnifiClient (reglas de firewall,
 * VLANs, interfaces) para que services/workers puedan tratar OPNsense
 * igual que UniFi sin ramificar lógica. Todavía no implementado — cada
 * método lanza explícitamente en vez de fallar en silencio o devolver
 * datos falsos.
 */
export type OpnsenseClient = UnifiClient;

export function notImplemented(method: string): never {
  throw new Error(`OpnsenseClient.${method} no está implementado todavía (fase 2)`);
}

export class OpnsenseClientStub implements OpnsenseClient {
  async listNodes() {
    return notImplemented("listNodes");
  }
  async getNodeDetail() {
    return notImplemented("getNodeDetail");
  }
  async listWifiNetworks() {
    return notImplemented("listWifiNetworks");
  }
  async getWifiNetwork() {
    return notImplemented("getWifiNetwork");
  }
  async listAlerts() {
    return notImplemented("listAlerts");
  }
  async writeWifiNetwork() {
    return notImplemented("writeWifiNetwork");
  }
  async rebootNode() {
    return notImplemented("rebootNode");
  }
}
