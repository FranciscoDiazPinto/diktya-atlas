import { Worker } from "bullmq";
import { createRedisConnection } from "../db/redis.js";
import type { RemediationJobData } from "./queues.js";
import { processRemediation } from "./remediation.logic.js";

const worker = new Worker<RemediationJobData>(
  "remediation",
  async (job) => processRemediation(job.data),
  { connection: createRedisConnection() }
);

worker.on("failed", (job, err) => {
  console.error(`[worker-remediation] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-remediation] escuchando cola 'remediation'..."));
