import { Redis } from "ioredis";
import { env } from "../config/env.js";

// BullMQ requiere maxRetriesPerRequest: null en la conexión que usan sus colas/workers.
export function createRedisConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redis = createRedisConnection();
