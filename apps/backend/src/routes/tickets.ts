import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { getRequestContext } from "../auth/context.js";
import { resolveTicket, reopenTicket } from "../services/ticket.service.js";
import { HttpError, NotFoundError } from "../lib/errors.js";

const ListQuerySchema = z.object({
  estado: z.enum(["ABIERTO", "EN_PROGRESO", "ESCALADO", "RESUELTO"]).optional(),
  severidad: z.enum(["INFO", "ADVERTENCIA", "CRITICO"]).optional(),
  nodoAfectadoId: z.string().optional(),
});

function assertCanManageTickets(role: string) {
  if (role === "VISUALIZADOR") {
    throw new HttpError(403, "El rol VISUALIZADOR solo puede ver tickets en modo lectura");
  }
}

export async function ticketRoutes(fastify: FastifyInstance) {
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

  fastify.post<{ Params: { id: string } }>("/tickets/:id/resolve", async (request, reply) => {
    const ctx = getRequestContext(request);
    assertCanManageTickets(ctx.role);
    return reply.send(await resolveTicket(request.params.id));
  });

  fastify.post<{ Params: { id: string } }>("/tickets/:id/reopen", async (request, reply) => {
    const ctx = getRequestContext(request);
    assertCanManageTickets(ctx.role);
    return reply.send(await reopenTicket(request.params.id));
  });
}
