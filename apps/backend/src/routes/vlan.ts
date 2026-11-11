import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reserveVlanPlanItems, enqueueApplyVlanPlan, getVlanPlanDetail, releaseApprovedReservation } from "../services/vlanFlow.service.js";
import { authorizeNetworkChange, validateStoredPlan } from "../services/planDiff.service.js";
import { prisma } from "../db/client.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { routeDocs } from "../lib/openapi.js";

const PlanReferenceSchema = z.object({ version: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
const ReserveBodySchema = PlanReferenceSchema.extend({ planId: z.string().min(1) }).strict();
const ApplyBodySchema = PlanReferenceSchema.extend({ reservationId: z.string().min(1), confirm: z.literal(true) }).strict();

export async function vlanRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireRole("ADMIN", "TECNICO"));
  fastify.addHook("onRequest", async (_, reply) => { reply.header("Cache-Control", "no-store, private"); });

  fastify.get("/vlan/plans", async (request) => {
    const ctx = request.authContext!;
    await authorizeNetworkChange(ctx);
    const { offset, limit } = z.object({ offset: z.coerce.number().int().nonnegative().default(0), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    const records = await prisma.networkChangePlan.findMany({ where: { ownerId: ctx.userId, ownerRole: ctx.role },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: limit });
    return records.map(validateStoredPlan);
  });
  fastify.get<{ Params: { id: string } }>("/vlan/plans/:id", async (request) => getVlanPlanDetail(request.params.id, request.authContext!));
  fastify.post("/vlan/reserve", {
    attachValidation: true,
    preValidation: async (request) => { ReserveBodySchema.parse(request.body); },
    schema: routeDocs({ summary: "Reservar un plan propio revisado, sin ejecutar cambios", tags: ["VLAN"], body: ReserveBodySchema }),
  }, async (request) => {
    const { planId, ...expected } = ReserveBodySchema.parse(request.body);
    return reserveVlanPlanItems(planId, request.authContext!, expected);
  });
  const ReleaseBodySchema = PlanReferenceSchema.extend({ reservationId: z.string().min(1) }).strict();
  fastify.post("/vlan/release", {
    preValidation: async (request) => { ReleaseBodySchema.parse(request.body); },
  }, async (request) => {
    const { reservationId, ...expected } = ReleaseBodySchema.parse(request.body);
    return releaseApprovedReservation(reservationId, request.authContext!, expected);
  });
  fastify.post("/vlan/apply", {
    attachValidation: true,
    preValidation: async (request) => { ApplyBodySchema.parse(request.body); },
    schema: routeDocs({ summary: "Confirmar explícitamente una fila del plan y encolar su ejecución", tags: ["VLAN"], body: ApplyBodySchema }),
  }, async (request, reply) => {
    const { reservationId, version, fingerprint } = ApplyBodySchema.parse(request.body);
    const result = await enqueueApplyVlanPlan(reservationId, request.authContext!, { version, fingerprint });
    return reply.code(result.encolado ? 202 : 200).send(result);
  });
}
