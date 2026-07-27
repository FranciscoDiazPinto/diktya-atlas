import { zodToJsonSchema } from "zod-to-json-schema";
import { toolsByRole, type Role } from "@diktya-atlas/shared";
import type { LlmToolDefinition } from "../provider.js";
import { toolSchemaFor, toolDescriptions } from "./schemas.js";

/**
 * Defensa en profundidad: las tools disponibles se filtran por rol ANTES
 * de que el LLM las vea, no se confía en que el modelo "decida no
 * invocarlas". El backend también debe re-validar el rol al ejecutar la
 * tool (ver routes/chat.ts) — este filtro reduce superficie, no reemplaza
 * esa validación.
 */
export function getToolsForRole(role: Role): LlmToolDefinition[] {
  return toolsByRole[role].map((name) => ({
    name,
    description: toolDescriptions[name],
    parameters: zodToJsonSchema(toolSchemaFor(name), { target: "openApi3" }) as Record<string, unknown>,
  }));
}

export function isToolAllowedForRole(role: Role, toolName: string): boolean {
  return (toolsByRole[role] as readonly string[]).includes(toolName);
}
