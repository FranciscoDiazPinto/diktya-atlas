import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getOpnsenseStatusSummary } from "../services/opnsense.service.js";

/**
 * Panel de infraestructura — hoy solo OPNsense (UniFi ya se ve en
 * /network/status para todos los roles). Restringido a ADMIN: es
 * información de la infraestructura core, no del despliegue de un evento.
 */
export async function opnsenseRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/opnsense/status", { preHandler: requireRole("ADMIN") }, async (_request, reply) => {
    return reply.send(await getOpnsenseStatusSummary());
  });
}
