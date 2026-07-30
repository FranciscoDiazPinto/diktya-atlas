import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getUnifiOsStatus } from "../services/unifiOsStatus.service.js";

/**
 * Estado real (no mock) de un UniFi OS vía su API de integraciones, de
 * solo lectura. Separado de /network/status (que es el UniFi mock que ven
 * todos los roles) para no mezclar datos reales con datos de prueba en la
 * misma vista — vive en el panel de Infraestructura, solo ADMIN.
 */
export async function unifiOsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/unifi-os/status", { preHandler: requireRole("ADMIN") }, async (_request, reply) => {
    return reply.send(await getUnifiOsStatus());
  });
}
