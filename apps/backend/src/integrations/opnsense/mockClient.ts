import type { NetworkNode, WifiNetwork, Alert } from "../../domain/network.js";
import type { OpnsenseClient } from "./client.js";
import type { WriteWifiNetworkInput } from "../unifi/client.js";

/**
 * Cliente en memoria para desarrollo, análogo a MockUnifiClient. OPNsense no
 * gestiona SSIDs (eso es dominio de UniFi) — `listWifiNetworks` siempre
 * devuelve vacío y `writeWifiNetwork` nunca debería invocarse para este
 * cliente; se deja `notImplemented` a propósito en vez de fingir soporte.
 */
export class MockOpnsenseClient implements OpnsenseClient {
  private nodes = new Map<string, NetworkNode>();
  private alerts: Alert[] = [];

  seedNode(node: NetworkNode) {
    this.nodes.set(node.id, node);
  }

  seedAlert(alert: Alert) {
    this.alerts.push(alert);
  }

  async listNodes(sitio?: string): Promise<NetworkNode[]> {
    const all = [...this.nodes.values()];
    return sitio ? all.filter((n) => n.sitio === sitio) : all;
  }

  async getNodeDetail(nodeId: string): Promise<NetworkNode | null> {
    return this.nodes.get(nodeId) ?? null;
  }

  async listWifiNetworks(): Promise<WifiNetwork[]> {
    return [];
  }

  async getWifiNetwork(): Promise<WifiNetwork | null> {
    return null;
  }

  async listAlerts(sitio?: string): Promise<Alert[]> {
    return sitio ? this.alerts.filter((a) => a.sitio === sitio) : this.alerts;
  }

  async writeWifiNetwork(_input: WriteWifiNetworkInput): Promise<WifiNetwork> {
    throw new Error("OpnsenseClient.writeWifiNetwork no aplica — OPNsense no administra SSIDs, eso es UniFi.");
  }

  async rebootNode(_nodeId: string): Promise<void> {
    throw new Error("OpnsenseClient.rebootNode no aplica — reinicio de APs es dominio de UniFi, no OPNsense.");
  }
}
