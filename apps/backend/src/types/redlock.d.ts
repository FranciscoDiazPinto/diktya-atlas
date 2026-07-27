// El paquete "redlock" (v5 beta) no resuelve sus tipos bajo
// moduleResolution: NodeNext (su package.json "exports" no expone
// dist/index.d.ts en la condición "types" que Node16/NodeNext espera).
// Shim mínimo con la superficie que usamos en services/lock.service.ts.
declare module "redlock" {
  import type { Redis } from "ioredis";

  export interface Settings {
    retryCount?: number;
    retryDelay?: number;
    retryJitter?: number;
    automaticExtensionThreshold?: number;
  }

  export class ExecutionError extends Error {}

  export interface Lock {
    release(): Promise<unknown>;
  }

  export default class Redlock {
    constructor(clients: Redis[], settings?: Settings);
    on(event: "error", callback: (err: unknown) => void): void;
    acquire(resources: string[], duration: number): Promise<Lock>;
    using<T>(resources: string[], duration: number, routine: (signal: unknown) => Promise<T>): Promise<T>;
  }
}
