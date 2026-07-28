import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getNetworkStatusSummary, getApDetail } from "../services/network.service.js";
import { authenticate } from "../auth/middleware.js";

const StatusQuerySchema = z.object({ sitio: z.string().optional() });

export async function networkRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  // Cualquier rol autenticado puede leer estado de red (incl. VISUALIZADOR).
  fastify.get("/network/status", async (request, reply) => {
    const { sitio } = StatusQuerySchema.parse(request.query);
    return reply.send(await getNetworkStatusSummary(sitio));
  });

  fastify.get<{ Params: { id: string } }>("/network/nodes/:id", async (request, reply) => {
    return reply.send(await getApDetail(request.params.id));
  });
}
