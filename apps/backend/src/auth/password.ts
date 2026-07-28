import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 declara Algorithm como `const enum`, inaccesible bajo
// isolatedModules (tsconfig.base.json) al importarlo desde otro paquete.
// 2 = Argon2id (ver node_modules/.../index.d.ts) — valor estable de su API.
const ARGON2ID = 2;

/**
 * argon2id explícito (aunque ya es el default de la librería) porque el
 * prompt de seguridad lo pide por nombre — resiste tanto ataques por
 * canal lateral como cracking por GPU, es la recomendación normativa actual.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, { algorithm: ARGON2ID });
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}
