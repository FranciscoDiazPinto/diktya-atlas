import { Worker } from "bullmq";
import { createRedisConnection } from "../db/redis.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { syncNode } from "../services/nodeSync.service.js";
import type { MonitorJobData } from "./queues.js";

/**
 * Único worker que hace polling a UniFi. Persiste el estado en Postgres
 * (nunca en memoria del proceso) para que un restart no pierda contexto,
 * y publica cada cambio al hub de tiempo real para el dashboard. La lógica
 * de upsert/detección de offline vive en nodeSync.service.ts, compartida
 * con el diagnóstico bajo demanda de un solo nodo (routes/network.ts).
 */
async function pollAllSites(): Promise<void> {
  const client = getUnifiClient();
  const nodes = await client.listNodes();
  for (const node of nodes) {
    await syncNode(node);
  }
}

const worker = new Worker<MonitorJobData>("monitor", async () => pollAllSites(), {
  connection: createRedisConnection(),
});

worker.on("failed", (job, err) => {
  console.error(`[worker-monitor] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-monitor] escuchando cola 'monitor'..."));
