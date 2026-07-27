import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { scheduleRepeatableJobs } from "./workers/queues.js";

async function main() {
  const app = buildApp();
  await scheduleRepeatableJobs();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Fallo al arrancar el servidor:", err);
  process.exit(1);
});
