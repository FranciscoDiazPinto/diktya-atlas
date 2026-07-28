import type { FastifyReply, FastifyRequest } from "fastify";
import { RoleSchema, type Role } from "@diktya-atlas/shared";
import { env } from "../config/env.js";
import { recordAudit } from "../services/audit.service.js";
import { verifyAccessToken } from "./tokens.js";
import { DEV_USER_IDS, type RequestContext } from "./context.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: RequestContext;
  }
}

function devHeaderFallback(request: FastifyRequest): RequestContext | null {
  if (!env.ALLOW_DEV_ROLE_HEADER) return null;

  const headerRole = request.headers["x-role"];
  const parsed = RoleSchema.safeParse(Array.isArray(headerRole) ? headerRole[0] : headerRole);
  if (!parsed.success) return null;

  const headerUserId = request.headers["x-user-id"];
  const userId = typeof headerUserId === "string" ? headerUserId : DEV_USER_IDS[parsed.data];
  return { userId, role: parsed.data };
}

/**
 * preHandler de autenticación. Primero intenta el Bearer JWT real
 * (`Authorization: Bearer <accessToken>`); si no hay uno válido y
 * `ALLOW_DEV_ROLE_HEADER` está habilitado (nunca en producción — ver
 * config/env.ts), cae al header `x-role`/`x-user-id` para no romper curl
 * manual / scripts de desarrollo. Sin ninguno de los dos, 401.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(authHeader.slice("Bearer ".length));
      request.authContext = { userId: payload.sub, role: payload.role };
      return;
    } catch {
      reply.code(401).send({ error: "Access token inválido o expirado" });
      return;
    }
  }

  const devContext = devHeaderFallback(request);
  if (devContext) {
    request.authContext = devContext;
    return;
  }

  reply.code(401).send({ error: "No autenticado" });
}

/**
 * Se usa DESPUÉS de `authenticate` en la cadena de preHandlers. Defensa en
 * profundidad además del filtro de tools por rol (llm/tools/registry.ts):
 * esta es la que realmente bloquea, y deja auditoría de cada intento
 * rechazado — no solo confía en que el LLM/frontend no pida la acción.
 */
export function requireRole(...roles: Role[]) {
  return async function requireRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = request.authContext;
    if (!ctx) {
      reply.code(401).send({ error: "No autenticado" });
      return;
    }
    if (!roles.includes(ctx.role)) {
      await recordAudit({
        actorId: ctx.userId,
        workerName: "http-request",
        parametros: { path: request.url, method: request.method, rolesRequeridos: roles },
        resultado: { error: "rol_no_autorizado", rolActual: ctx.role },
        exitoso: false,
      });
      reply.code(403).send({ error: `Se requiere uno de estos roles: ${roles.join(", ")}` });
    }
  };
}
