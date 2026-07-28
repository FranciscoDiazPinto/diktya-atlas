import type { Role } from "@diktya-atlas/shared";

export interface RequestContext {
  userId: string;
  role: Role;
}

/** IDs de usuarios de desarrollo sembrados por prisma/seed.ts — usados por
 * el fallback de header en auth/middleware.ts cuando ALLOW_DEV_ROLE_HEADER
 * está habilitado (nunca en producción). */
export const DEV_USER_IDS: Record<Role, string> = {
  ADMIN: "dev-admin",
  TECNICO: "dev-tecnico",
  VISUALIZADOR: "dev-visualizador",
};
