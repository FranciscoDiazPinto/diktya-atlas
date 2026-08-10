import { Worker } from "bullmq";
import { createRedisConnection } from "../db/redis.js";
import { getAtlasClient } from "../integrations/atlas/index.js";
import { atlasEquipoToNetworkNode } from "../integrations/atlas/normalize.js";
import { syncNode } from "../services/nodeSync.service.js";
import type { MonitorJobData } from "./queues.js";

/**
 * Único worker que hace polling — desde el 2026-08-10 vía `/inventory` de
 * ATLAS, nunca directo a UniFi (regla dura de arquitectura, ver
 * `Atlas/ARGOS Arquitectura y Entrega 2026-08-10.md`). Persiste el estado
 * en Postgres (nunca en memoria del proceso) para que un restart no pierda
 * contexto, y publica cada cambio al hub de tiempo real para el dashboard.
 * La lógica de upsert/detección de offline vive en nodeSync.service.ts,
 * compartida con el diagnóstico bajo demanda de un solo nodo
 * (routes/network.ts, que sigue yendo directo a UniFi — ver ese archivo).
 */
async function pollAllSites(): Promise<void> {
  const client = getAtlasClient();
  const { equipos } = await client.inventory();
  for (const equipo of equipos) {
    await syncNode(atlasEquipoToNetworkNode(equipo));
  }
}

const worker = new Worker<MonitorJobData>("monitor", async () => pollAllSites(), {
  connection: createRedisConnection(),
});

worker.on("failed", (job, err) => {
  console.error(`[worker-monitor] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-monitor] escuchando cola 'monitor'..."));
