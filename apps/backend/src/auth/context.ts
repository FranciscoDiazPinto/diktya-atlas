import type { FastifyRequest } from "fastify";
import { RoleSchema, type Role } from "@diktya-atlas/shared";

export interface RequestContext {
  userId: string;
  role: Role;
}

/** IDs de usuarios de desarrollo sembrados por prisma/seed.ts, para que el
 * stub tenga un userId real (FK válida) sin necesitar login todavía. */
export const DEV_USER_IDS: Record<Role, string> = {
  ADMIN: "dev-admin",
  TECNICO: "dev-tecnico",
  VISUALIZADOR: "dev-visualizador",
};

/**
 * STUB TEMPORAL: lee el rol de un header (`x-role`) en vez de validar un
 * JWT real. Existe solo para poder probar el filtrado de tools/endpoints
 * por rol en esta primera pasada del backend — el prompt de seguridad lo
 * reemplaza por JWT de acceso de vida corta + refresh rotation + 2FA.
 *
 * NUNCA desplegar así: con este stub, cualquiera que mande
 * `x-role: ADMIN` obtiene privilegios de admin.
 */
export function getRequestContext(request: FastifyRequest): RequestContext {
  const headerRole = request.headers["x-role"];
  const parsed = RoleSchema.safeParse(Array.isArray(headerRole) ? headerRole[0] : headerRole);
  const role = parsed.success ? parsed.data : "VISUALIZADOR";

  const headerUserId = request.headers["x-user-id"];
  const userId = typeof headerUserId === "string" ? headerUserId : DEV_USER_IDS[role];

  return { userId, role };
}
