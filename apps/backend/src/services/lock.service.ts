import Redlock, { ExecutionError } from "redlock";
import { redis } from "../db/redis.js";

const redlock = new Redlock([redis], {
  retryCount: 3,
  retryDelay: 200, // ms
  retryJitter: 100,
});

redlock.on("error", (err) => {
  // Redlock loguea errores de nodos individuales incluso cuando el quorum
  // general tiene éxito; no tratar esto como fallo del lock en sí.
  console.error("[lock.service] error de Redlock", err);
});

export function writeLockKey(sitio: string, vlanId: number): string {
  return `write-lock:${sitio}:${vlanId}`;
}

export class LockAcquisitionError extends Error {
  constructor(key: string) {
    super(`No se pudo adquirir el lock distribuido: ${key}`);
  }
}

/**
 * Ejecuta `fn` bajo el lock distribuido `write-lock:{sitio}:{vlanId}`.
 * Cualquier escritura real en UniFi/OPNsense/Proxmox debe pasar por acá,
 * sin importar qué worker la origina — es la única forma de garantizar
 * "un solo dueño por recurso a la vez" entre workers concurrentes.
 */
export async function withWriteLock<T>(
  sitio: string,
  vlanId: number,
  fn: () => Promise<T>,
  ttlMs = 30_000
): Promise<T> {
  const key = writeLockKey(sitio, vlanId);
  try {
    return await redlock.using([key], ttlMs, async () => fn());
  } catch (err) {
    if (err instanceof ExecutionError) {
      throw new LockAcquisitionError(key);
    }
    throw err;
  }
}
