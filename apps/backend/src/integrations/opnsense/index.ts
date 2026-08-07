import { env } from "../../config/env.js";
import type { OpnsenseClient } from "./client.js";
import { MockOpnsenseClient } from "./mockClient.js";
import { createOpnsenseLiveClientFromEnv } from "./liveClient.js";

export type { OpnsenseClient } from "./client.js";
export { OpnsenseClientStub } from "./client.js";
export { MockOpnsenseClient } from "./mockClient.js";
export { OpnsenseLiveClient } from "./liveClient.js";

let instance: OpnsenseClient | undefined;

/**
 * Datos de ejemplo para que el panel de admin tenga contenido desde el
 * primer arranque en OPNSENSE_MODE=mock. Representa el par HA real
 * (CORE-01 MASTER / CORE-02 BACKUP) solo para fines de demo/desarrollo.
 */
function seedDemoData(client: MockOpnsenseClient): void {
  const now = new Date().toISOString();
  client.seedNode({
    id: "core-01",
    sitio: "core",
    nombre: "CORE-01 (MASTER)",
    modelo: "OPNsense HA",
    tipoDispositivo: "GATEWAY",
    status: "online",
    clientesConectados: 0,
    uptimeSegundos: 2_592_000,
    ultimaVezVisto: now,
    ssidsTransmitidos: [],
  });
  client.seedNode({
    id: "core-02",
    sitio: "core",
    nombre: "CORE-02 (BACKUP)",
    modelo: "OPNsense HA",
    tipoDispositivo: "GATEWAY",
    status: "online",
    clientesConectados: 0,
    uptimeSegundos: 2_592_000,
    ultimaVezVisto: now,
    ssidsTransmitidos: [],
  });
}

export function getOpnsenseClient(): OpnsenseClient {
  if (!instance) {
    if (env.OPNSENSE_MODE === "live") {
      instance = createOpnsenseLiveClientFromEnv();
    } else {
      const mock = new MockOpnsenseClient();
      seedDemoData(mock);
      instance = mock;
    }
  }
  return instance;
}
