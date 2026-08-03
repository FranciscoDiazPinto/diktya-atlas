import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getMobilityStatus, getMobilityDeviceDetail } from "../services/mobilityStatus.service.js";
import { routeDocs } from "../lib/openapi.js";

const DeviceParamSchema = z.object({ workspaceId: z.string(), deviceId: z.string() });

/**
 * Estado de routers móviles/de viaje UMR (UniFi Mobility, API cloud
 * separada de OPNsense/UniFi OS) — solo lectura, solo ADMIN, mismo criterio
 * que el resto de /infra (información de infraestructura core, no del
 * despliegue de un evento puntual).
 */
export async function mobilityRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/mobility/status",
    {
      preHandler: requireRole("ADMIN"),
      schema: routeDocs({
        summary: "Estado de UniFi Mobility: workspaces + devices",
        description: "Resumen liviano (sin señal LTE/VPN/ubicación) — ver GET .../devices/:deviceId para el detalle.",
        tags: ["Infraestructura"],
      }),
    },
    async (_request, reply) => {
      return reply.send(await getMobilityStatus());
    }
  );

  fastify.get<{ Params: { workspaceId: string; deviceId: string } }>(
    "/mobility/workspaces/:workspaceId/devices/:deviceId",
    {
      preHandler: requireRole("ADMIN"),
      schema: routeDocs({
        summary: "Detalle de un device de Mobility (señal, VPN, ubicación) + sus clientes",
        tags: ["Infraestructura"],
        params: DeviceParamSchema,
      }),
    },
    async (request, reply) => {
      return reply.send(await getMobilityDeviceDetail(request.params.workspaceId, request.params.deviceId));
    }
  );
}
