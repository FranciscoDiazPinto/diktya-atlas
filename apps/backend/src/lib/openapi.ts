import type { FastifySchema } from "fastify";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Reusa el mismo schema Zod que cada ruta ya usa para `.parse()` a mano —
 * esto es SOLO para que @fastify/swagger arme la doc, nunca para validar
 * en runtime (ver `routeDocs`: cada ruta que lo usa lleva
 * `attachValidation: true`, así que Fastify nunca corta la request por su
 * cuenta con un formato de error distinto al de `app.ts`; el `.parse()`
 * manual en el handler sigue siendo la única fuente de verdad).
 */
function jsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  // Sin `target: "openApi3"` a propósito: Fastify compila este mismo objeto
  // con ajv para (no-op) validación de request (`attachValidation: true`
  // en cada ruta neutraliza el resultado, ver arriba) — ajv espera JSON
  // Schema draft-07 (`exclusiveMinimum` booleano), no el numérico de
  // OpenAPI 3. @fastify/swagger convierte draft-07 -> OpenAPI 3 solo para
  // la doc, así que el draft-07 de zod-to-json-schema (default) sirve para
  // ambos casos sin fricción.
  return zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
}

export interface RouteDocsOptions {
  summary: string;
  description?: string;
  tags: string[];
  /** false en rutas públicas (login, refresh) — omite el candado de bearer auth en la doc. */
  auth?: boolean;
  querystring?: ZodTypeAny;
  body?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function routeDocs(opts: RouteDocsOptions): FastifySchema {
  const schema: FastifySchema = {
    summary: opts.summary,
    tags: opts.tags,
    security: opts.auth === false ? [] : [{ bearerAuth: [] }],
  };
  if (opts.description) schema.description = opts.description;
  if (opts.querystring) schema.querystring = jsonSchema(opts.querystring);
  if (opts.body) schema.body = jsonSchema(opts.body);
  if (opts.params) schema.params = jsonSchema(opts.params);
  return schema;
}

/** Para las rutas multipart (upload de CSV/planos) — Zod no describe bien un form-data, alcanza con dejarlo explícito. */
export function multipartRouteDocs(opts: Omit<RouteDocsOptions, "body">): FastifySchema {
  return { ...routeDocs(opts), consumes: ["multipart/form-data"] };
}
