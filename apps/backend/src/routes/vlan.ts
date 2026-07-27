import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequestContext } from "../auth/context.js";
import { reserveVlanPlanItems, enqueueApplyVlanPlan } from "../services/vlanFlow.service.js";
import { isToolAllowedForRole } from "../llm/tools/registry.js";
import { HttpError } from "../lib/errors.js";

const ReserveBodySchema = z.object({ planId: z.string() });
const ApplyBodySchema = z.object({ reservationId: z.string() });

export async function vlanRoutes(fastify: FastifyInstance) {
  // Endpoint de ejemplo end-to-end (paso 2/4): reserva cada ítem del plan
  // (INSERT con constraint único vlan_id+sitio -> 409 si ya hay una reserva activa).
  fastify.post("/vlan/reserve", async (request, reply) => {
    const ctx = getRequestContext(request);
    if (!isToolAllowedForRole(ctx.role, "reserve_vlan")) {
      throw new HttpError(403, `El rol ${ctx.role} no puede reservar VLANs`);
    }
    const { planId } = ReserveBodySchema.parse(request.body);
    const result = await reserveVlanPlanItems(planId, ctx.userId);
    return reply.send(result);
  });

  // Endpoint de ejemplo end-to-end (paso 4/4, tras confirmación explícita
  // del usuario en el paso 3): encola la aplicación real en remediation-queue.
  fastify.post("/vlan/apply", async (request, reply) => {
    const ctx = getRequestContext(request);
    if (!isToolAllowedForRole(ctx.role, "apply_vlan_plan")) {
      throw new HttpError(403, `El rol ${ctx.role} no puede aplicar cambios de red`);
    }
    const { reservationId } = ApplyBodySchema.parse(request.body);
    const result = await enqueueApplyVlanPlan(reservationId);
    return reply.code(202).send(result);
  });
}
