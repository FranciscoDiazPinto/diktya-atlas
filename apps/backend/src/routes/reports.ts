import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getActivityDigest } from "../services/activityDigest.service.js";
import { getAvailability } from "../services/nodeAvailability.service.js";
import { routeDocs } from "../lib/openapi.js";
import { startOfToday } from "../lib/dates.js";

const DigestQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  eventDeploymentId: z.string().optional(),
});

const AvailabilityQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

/** Reportes de solo lectura, abiertos a los 3 roles (mismo criterio que /network/status y /events/:id/report). */
export async function reportRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/reports/digest",
    {
      attachValidation: true,
      schema: routeDocs({
        summary: "Digest de actividad por rango (alertas, tickets, VLANs, auditoría)",
        description: "`desde`/`hasta` default a \"hoy\" si se omiten. Abierto a los 3 roles.",
        tags: ["Reportes"],
        querystring: DigestQuerySchema,
      }),
    },
    async (request, reply) => {
      const { desde, hasta, eventDeploymentId } = DigestQuerySchema.parse(request.query);
      return reply.send(
        await getActivityDigest({
          desde: desde ?? startOfToday(),
          hasta: hasta ?? new Date(),
          eventDeploymentId,
        })
      );
    }
  );

  // Solo Admin — mismo criterio que /opnsense/status y /unifi-os/status,
  // los otros endpoints que alimentan /infra.
  fastify.get(
    "/reports/availability",
    {
      preHandler: requireRole("ADMIN"),
      attachValidation: true,
      schema: routeDocs({
        summary: "Disponibilidad real por rango: % por nodo, serie temporal, histograma de cortes",
        description:
          "A partir de NodeStatusEvent (evento por cambio de estado real, no por poll). " +
          "`disponibilidadPct: null` (no 0) para tramos sin ningún evento conocido todavía.",
        tags: ["Reportes"],
        querystring: AvailabilityQuerySchema,
      }),
    },
    async (request, reply) => {
      const { desde, hasta } = AvailabilityQuerySchema.parse(request.query);
      return reply.send(
        await getAvailability({
          desde: desde ?? startOfToday(),
          hasta: hasta ?? new Date(),
        })
      );
    }
  );
}
