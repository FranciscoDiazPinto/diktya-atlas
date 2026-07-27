import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

export interface RecordAuditInput {
  actorId?: string;
  workerName: string;
  toolName?: string;
  parametros: unknown;
  resultado: unknown;
  exitoso: boolean;
}

/**
 * Cada acción de cada worker/tool queda registrada: quién/qué la ejecutó,
 * con qué parámetros, y el resultado. Auditoría indispensable en un
 * sistema que toca infraestructura real — nunca "el sistema hizo X".
 */
export async function recordAudit(input: RecordAuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      workerName: input.workerName,
      toolName: input.toolName,
      parametros: input.parametros as Prisma.InputJsonValue,
      resultado: input.resultado as Prisma.InputJsonValue,
      exitoso: input.exitoso,
    },
  });
}
