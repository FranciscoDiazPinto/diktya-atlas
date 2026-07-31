import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getActivityDigest } from "../services/activityDigest.service.js";
import { getAvailability } from "../services/nodeAvailability.service.js";

const DigestQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  eventDeploymentId: z.string().optional(),
});

const AvailabilityQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Reportes de solo lectura, abiertos a los 3 roles (mismo criterio que /network/status y /events/:id/report). */
export async function reportRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/reports/digest", async (request, reply) => {
    const { desde, hasta, eventDeploymentId } = DigestQuerySchema.parse(request.query);
    return reply.send(
      await getActivityDigest({
        desde: desde ?? startOfToday(),
        hasta: hasta ?? new Date(),
        eventDeploymentId,
      })
    );
  });

  // Solo Admin — mismo criterio que /opnsense/status y /unifi-os/status,
  // los otros endpoints que alimentan /infra.
  fastify.get("/reports/availability", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
    const { desde, hasta } = AvailabilityQuerySchema.parse(request.query);
    return reply.send(
      await getAvailability({
        desde: desde ?? startOfToday(),
        hasta: hasta ?? new Date(),
      })
    );
  });
}
