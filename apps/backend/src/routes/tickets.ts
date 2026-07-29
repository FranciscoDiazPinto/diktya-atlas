import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { createTicket, resolveTicket, reopenTicket } from "../services/ticket.service.js";
import { recordAudit } from "../services/audit.service.js";
import { NotFoundError } from "../lib/errors.js";
import { authenticate, requireRole } from "../auth/middleware.js";

const ListQuerySchema = z.object({
  estado: z.enum(["ABIERTO", "EN_PROGRESO", "ESCALADO", "RESUELTO"]).optional(),
  severidad: z.enum(["INFO", "ADVERTENCIA", "CRITICO"]).optional(),
  nodoAfectadoId: z.string().optional(),
});

const CreateTicketBodySchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  severidad: z.enum(["INFO", "ADVERTENCIA", "CRITICO"]),
  nodoAfectadoId: z.string().optional(),
  eventDeploymentId: z.string().optional(),
});

export async function ticketRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.post(
    "/tickets",
    { preHandler: requireRole("ADMIN", "TECNICO") },
    async (request, reply) => {
      const body = CreateTicketBodySchema.parse(request.body);
      const ticket = await createTicket(body);
      await recordAudit({
        actorId: request.authContext!.userId,
        workerName: "rest-api",
        toolName: "create_ticket",
        parametros: body,
        resultado: ticket,
        exitoso: true,
      });
      return reply.code(201).send(ticket);
    }
  );

  fastify.get("/tickets", async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const tickets = await prisma.ticket.findMany({
      where: query,
      orderBy: { createdAt: "desc" },
    });
    return reply.send(tickets);
  });

  fastify.get<{ Params: { id: string } }>("/tickets/:id", async (request, reply) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: request.params.id },
      include: { eventos: { orderBy: { createdAt: "asc" } }, alerts: true },
    });
    if (!ticket) throw new NotFoundError(`ticket ${request.params.id}`);
    return reply.send(ticket);
  });

  fastify.post<{ Params: { id: string } }>(
    "/tickets/:id/resolve",
    { preHandler: requireRole("ADMIN", "TECNICO") },
    async (request, reply) => {
      return reply.send(await resolveTicket(request.params.id));
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/tickets/:id/reopen",
    { preHandler: requireRole("ADMIN", "TECNICO") },
    async (request, reply) => {
      return reply.send(await reopenTicket(request.params.id));
    }
  );
}
