import { z } from "zod";

/**
 * Roles del sistema. VISUALIZADOR nunca debe llegar a invocar tools que
 * modifiquen estado — ver llm/tools/registry.ts en el backend, que filtra
 * las tools disponibles ANTES de la llamada al LLM según este valor.
 */
export const RoleSchema = z.enum(["ADMIN", "TECNICO", "VISUALIZADOR"]);
export type Role = z.infer<typeof RoleSchema>;
