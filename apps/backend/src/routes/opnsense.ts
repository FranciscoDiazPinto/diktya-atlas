import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getOpnsenseStatusSummary } from "../services/opnsense.service.js";
import { routeDocs } from "../lib/openapi.js";

/**
 * Panel de infraestructura — hoy solo OPNsense (UniFi ya se ve en
 * /network/status para todos los roles). Restringido a ADMIN: es
 * información de la infraestructura core, no del despliegue de un evento.
 */
export async function opnsenseRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/opnsense/status",
    {
      preHandler: requireRole("ADMIN"),
      schema: routeDocs({
        summary: "Estado HA core (CORE-01/CORE-02) + alertas, vía ATLAS",
        description: "Lee en vivo de la API de ATLAS en cada request (ATLAS_MODE=mock por defecto), no vía Postgres.",
        tags: ["Infraestructura"],
      }),
    },
    async (_request, reply) => {
      return reply.send(await getOpnsenseStatusSummary());
    }
  );
}
