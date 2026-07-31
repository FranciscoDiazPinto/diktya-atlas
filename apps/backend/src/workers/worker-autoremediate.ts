import { Worker } from "bullmq";
import { createRedisConnection } from "../db/redis.js";
import type { AutoRemediateJobData } from "./queues.js";
import { processAutoRemediation } from "../services/autoRemediation.service.js";

const worker = new Worker<AutoRemediateJobData>(
  "auto-remediate",
  async (job) => processAutoRemediation(job.data),
  { connection: createRedisConnection() }
);

worker.on("failed", (job, err) => {
  console.error(`[worker-autoremediate] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-autoremediate] escuchando cola 'auto-remediate'..."));
