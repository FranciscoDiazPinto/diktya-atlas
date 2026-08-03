import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../auth/middleware.js";
import { listSiteManagerHosts } from "../services/siteManagerHosts.service.js";
import { routeDocs } from "../lib/openapi.js";

/**
 * Solo lectura, solo ADMIN — hoy sirve principalmente para descubrir el
 * `id` de la consola real y configurar UNIFI_SITE_MANAGER_HOST_ID (ver
 * integrations/unifiOs/client.ts::viaConnector).
 */
export async function siteManagerRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/site-manager/hosts",
    {
      preHandler: requireRole("ADMIN"),
      schema: routeDocs({
        summary: "Listar hosts (consolas) de la cuenta UI de Site Manager",
        description:
          "Útil para descubrir el `id` de la consola real y configurar UNIFI_SITE_MANAGER_HOST_ID " +
          "(el connector de Site Manager, usado como transporte alternativo de la Integration API, " +
          "necesita ese id — ver UNIFI_INTEGRATION_TRANSPORT).",
        tags: ["Infraestructura"],
      }),
    },
    async (_request, reply) => {
      return reply.send(await listSiteManagerHosts());
    }
  );
}
