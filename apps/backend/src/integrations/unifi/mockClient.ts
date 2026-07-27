import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";
import type { UnifiClient, WriteWifiNetworkInput } from "./client.js";

/**
 * Cliente en memoria para desarrollo/tests sin credenciales reales.
 * Determinista y sin latencia de red simulada a propósito: los tests de
 * concurrencia (doble escritura) controlan el timing explícitamente
 * mutando el store directo con `seedWifiNetwork` / `_setWifiNetworkRaw`,
 * no dependiendo de sleeps.
 */
export class MockUnifiClient implements UnifiClient {
  private nodes = new Map<string, NetworkNode>();
  private wifiNetworks = new Map<string, WifiNetwork>(); // key: `${sitio}::${ssid}`
  private alerts: Alert[] = [];

  private key(sitio: string, ssid: string) {
    return `${sitio}::${ssid}`;
  }

  seedNode(node: NetworkNode) {
    this.nodes.set(node.id, node);
  }

  seedWifiNetwork(network: WifiNetwork) {
    this.wifiNetworks.set(this.key(network.sitio, network.ssid), network);
  }

  seedAlert(alert: Alert) {
    this.alerts.push(alert);
  }

  /** Simula que otro proceso ya escribió el recurso, para probar detección de doble escritura. */
  simulateExternalWrite(sitio: string, ssid: string, vlanId: number) {
    const existing = this.wifiNetworks.get(this.key(sitio, ssid));
    this.wifiNetworks.set(this.key(sitio, ssid), {
      id: existing?.id ?? `wlan-${sitio}-${ssid}`,
      sitio,
      ssid,
      vlanId,
      bandas: existing?.bandas ?? ["5GHz"],
      clientesConectados: existing?.clientesConectados ?? 0,
    });
  }

  async listNodes(sitio?: string): Promise<NetworkNode[]> {
    const all = [...this.nodes.values()];
    return sitio ? all.filter((n) => n.sitio === sitio) : all;
  }

  async getNodeDetail(nodeId: string): Promise<NetworkNode | null> {
    return this.nodes.get(nodeId) ?? null;
  }

  async listWifiNetworks(sitio?: string): Promise<WifiNetwork[]> {
    const all = [...this.wifiNetworks.values()];
    return sitio ? all.filter((w) => w.sitio === sitio) : all;
  }

  async getWifiNetwork(sitio: string, ssid: string): Promise<WifiNetwork | null> {
    return this.wifiNetworks.get(this.key(sitio, ssid)) ?? null;
  }

  async listAlerts(sitio?: string): Promise<Alert[]> {
    return sitio ? this.alerts.filter((a) => a.sitio === sitio) : this.alerts;
  }

  async writeWifiNetwork(input: WriteWifiNetworkInput): Promise<WifiNetwork> {
    const existing = this.wifiNetworks.get(this.key(input.sitio, input.ssid));
    const written: WifiNetwork = {
      id: existing?.id ?? `wlan-${input.sitio}-${input.ssid}`,
      sitio: input.sitio,
      ssid: input.ssid,
      vlanId: input.vlanId,
      bandas: input.bandas,
      clientesConectados: existing?.clientesConectados ?? 0,
    };
    this.wifiNetworks.set(this.key(input.sitio, input.ssid), written);
    return written;
  }
}
