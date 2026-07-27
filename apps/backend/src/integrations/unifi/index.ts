import { env } from "../../config/env.js";
import type { UnifiClient } from "./client.js";
import { MockUnifiClient } from "./mockClient.js";
import { createUnifiLiveClientFromEnv } from "./liveClient.js";

export type { UnifiClient, WriteWifiNetworkInput } from "./client.js";
export { MockUnifiClient } from "./mockClient.js";
export { UnifiLiveClient } from "./liveClient.js";

let instance: UnifiClient | undefined;

/**
 * Datos de ejemplo solo para que la demo en navegador (frontend) tenga
 * contenido real desde el primer arranque en UNIFI_MODE=mock, sin esperar
 * a que alguien suba un CSV. No afecta a los tests: cada test instancia su
 * propio MockUnifiClient (ver test/unifi.mock.test.ts), nunca este singleton.
 */
function seedDemoData(client: MockUnifiClient): void {
  const now = new Date().toISOString();
  client.seedNode({
    id: "demo-ap-oficina",
    sitio: "oficina-central",
    nombre: "AP Recepción",
    modelo: "U6-Pro",
    status: "online",
    senalDbm: -45,
    clientesConectados: 12,
    uptimeSegundos: 86_400,
    ultimaVezVisto: now,
    ssidsTransmitidos: ["Oficina-5G"],
  });
  client.seedNode({
    id: "demo-ap-bodega",
    sitio: "oficina-central",
    nombre: "AP Bodega",
    modelo: "U6-Lite",
    status: "offline",
    clientesConectados: 0,
    uptimeSegundos: 0,
    ultimaVezVisto: now,
    ssidsTransmitidos: [],
  });
  client.seedWifiNetwork({
    id: "demo-wlan-oficina",
    sitio: "oficina-central",
    ssid: "Oficina-5G",
    vlanId: 10,
    bandas: ["5GHz"],
    clientesConectados: 12,
  });
}

export function getUnifiClient(): UnifiClient {
  if (!instance) {
    if (env.UNIFI_MODE === "live") {
      instance = createUnifiLiveClientFromEnv();
    } else {
      const mock = new MockUnifiClient();
      seedDemoData(mock);
      instance = mock;
    }
  }
  return instance;
}
