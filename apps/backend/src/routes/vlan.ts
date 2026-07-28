import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reserveVlanPlanItems, enqueueApplyVlanPlan } from "../services/vlanFlow.service.js";
import { authenticate, requireRole } from "../auth/middleware.js";

const ReserveBodySchema = z.object({ planId: z.string() });
const ApplyBodySchema = z.object({ reservationId: z.string() });

export async function vlanRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  // Endpoint de ejemplo end-to-end (paso 2/4): reserva cada ítem del plan
  // (INSERT con constraint único vlan_id+sitio -> 409 si ya hay una reserva activa).
  fastify.post("/vlan/reserve", { preHandler: requireRole("ADMIN", "TECNICO") }, async (request, reply) => {
    const ctx = request.authContext!;
    const { planId } = ReserveBodySchema.parse(request.body);
    const result = await reserveVlanPlanItems(planId, ctx.userId);
    return reply.send(result);
  });

  // Endpoint de ejemplo end-to-end (paso 4/4, tras confirmación explícita
  // del usuario en el paso 3): encola la aplicación real en remediation-queue.
  fastify.post("/vlan/apply", { preHandler: requireRole("ADMIN", "TECNICO") }, async (request, reply) => {
    const { reservationId } = ApplyBodySchema.parse(request.body);
    const result = await enqueueApplyVlanPlan(reservationId);
    return reply.code(202).send(result);
  });
}
