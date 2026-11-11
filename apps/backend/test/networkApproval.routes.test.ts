import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { HttpError } from "../src/lib/errors.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";
import { signAccessToken } from "../src/auth/tokens.js";
import { vlanRoutes } from "../src/routes/vlan.js";
import { generateVlanPlan } from "../src/services/planDiff.service.js";
import { processRemediation } from "../src/workers/remediation.logic.js";
import { getUnifiClient } from "../src/integrations/unifi/index.js";
import type { RequestContext } from "../src/auth/context.js";
import type { VlanPlan } from "@diktya-atlas/shared";

const { add } = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../src/workers/queues.js", () => ({ remediationQueue: { add } }));
vi.mock("../src/realtime/hub.js", () => ({ publishRealtimeEvent: vi.fn() }));
// El lock Redis se sustituye para probar también la exclusión durable mediante CAS.
vi.mock("../src/services/lock.service.js", () => ({
  LockAcquisitionError: class extends Error {},
  withWriteLock: async (_site: string, _vlan: number, fn: () => Promise<unknown>) => fn(),
}));

const app = Fastify();
const ids: string[] = [];
let owner: RequestContext;
let foreign: RequestContext;
let viewer: RequestContext;
const client = getUnifiClient();
const headers = (ctx: RequestContext) => ({ authorization: `Bearer ${signAccessToken({ sub: ctx.userId, role: ctx.role })}` });
const post = (path: string, ctx: RequestContext, payload: unknown) => app.inject({ method: "POST", url: path, headers: headers(ctx), payload });
async function proposal() {
  return generateVlanPlan([{ nombre_red: "Test", ssid: "Test", vlan_id: 88, banda: "5GHz", sitio: `approval-${randomUUID()}` }], client, owner);
}
async function reserved() {
  const plan = await proposal();
  const result = await post("/vlan/reserve", owner, { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint });
  expect(result.statusCode).toBe(200);
  return { plan, reservationId: result.json().results[0].reservationId as string };
}
const approve = (plan: VlanPlan, reservationId: string, ctx = owner) => post("/vlan/apply", ctx, { reservationId, version: plan.version, fingerprint: plan.fingerprint, confirm: true });

beforeAll(async () => {
  for (const role of ["TECNICO", "ADMIN", "VISUALIZADOR"] as const) {
    const user = await prisma.user.create({ data: { email: `approval-${randomUUID()}@test.local`, passwordHash: "unused", role } });
    ids.push(user.id);
  }
  owner = { userId: ids[0]!, role: "TECNICO" };
  foreign = { userId: ids[1]!, role: "ADMIN" };
  viewer = { userId: ids[2]!, role: "VISUALIZADOR" };
  app.setErrorHandler((err, _, reply) => reply.code(err instanceof HttpError ? err.statusCode : err instanceof ZodError ? 400 : 500).send({ error: err.message }));
  app.register(vlanRoutes);
  await app.ready();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  add.mockReset().mockImplementation(async (_name, _data, options) => ({ id: options.jobId }));
  await prisma.user.update({ where: { id: owner.userId }, data: { role: "TECNICO" } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.ticket.deleteMany({ where: { vlanReservation: { reservadoPorId: { in: ids } } } });
  await prisma.vlanReservation.deleteMany({ where: { reservadoPorId: { in: ids } } });
  await prisma.networkChangePlan.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  await prisma.$disconnect();
});

describe("aprobación explícita del plan exacto", () => {
  it("persiste propuestas propias sin encolar y no las expone a otros usuarios", async () => {
    const plan = await proposal();
    expect(await prisma.networkChangePlan.findUnique({ where: { id: plan.id } })).not.toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect((await app.inject({ url: "/vlan/plans", headers: headers(foreign) })).json()).toEqual([]);
    expect((await app.inject({ url: `/vlan/plans/${plan.id}`, headers: headers(foreign) })).statusCode).toBe(404);
    expect((await app.inject({ url: "/vlan/plans", headers: headers(viewer) })).statusCode).toBe(403);
    expect((await post("/vlan/reserve", owner, { planId: plan.id, version: 2, fingerprint: plan.fingerprint })).statusCode).toBe(409);
    expect((await post("/vlan/reserve", foreign, { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint })).statusCode).toBe(404);
  });
  it("requiere confirmación, versión y huella; impide aprobar reservas ajenas", async () => {
    const { plan, reservationId } = await reserved();
    expect((await post("/vlan/apply", owner, { reservationId })).statusCode).toBe(400);
    expect((await post("/vlan/apply", owner, { reservationId, version: 1, fingerprint: plan.fingerprint, confirm: false })).statusCode).toBe(400);
    expect((await approve(plan, reservationId, foreign)).statusCode).toBe(404);
    expect((await approve({ ...plan, fingerprint: "f".repeat(64) }, reservationId)).statusCode).toBe(409);
    expect(add).not.toHaveBeenCalled();
  });
  it("encola IDs una sola vez y marca aplicado únicamente después de verificar", async () => {
    const { plan, reservationId } = await reserved();
    const write = vi.spyOn(client, "writeWifiNetwork");
    const approved = await approve(plan, reservationId);
    expect(approved.statusCode).toBe(202);
    const approvalId = approved.json().approvalId as string;
    expect(add.mock.calls[0]![1]).toEqual({ reservationId, approvalId });
    expect(write).not.toHaveBeenCalled();
    expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).estado).toBe("RESERVADA");
    expect((await approve(plan, reservationId)).statusCode).toBe(200);
    expect(add).toHaveBeenCalledTimes(1);
    expect(await prisma.auditLog.count({ where: { toolName: "approve_vlan_plan", parametros: { path: ["approvalId"], equals: approvalId } } })).toBe(1);
    await Promise.all([processRemediation({ reservationId, approvalId }), processRemediation({ reservationId, approvalId })]);
    expect(write).toHaveBeenCalledTimes(1);
    const final = await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(final.estado).toBe("APLICADA");
    expect(final.executionStatus).toBe("APPLIED");
    await processRemediation({ reservationId, approvalId });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("rechaza instantáneas alteradas y propuestas vencidas", async () => {
    const { plan, reservationId } = await reserved();
    const altered = structuredClone(plan);
    altered.items[0]!.redPropuesta.vlanId = 99;
    await prisma.vlanReservation.update({ where: { id: reservationId }, data: { planSnapshot: altered } });
    expect((await approve(plan, reservationId)).statusCode).toBe(409);
    vi.spyOn(Date, "now").mockReturnValue(new Date(plan.expiresAt).getTime());
    expect((await post("/vlan/reserve", owner, { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint })).statusCode).toBe(409);
    expect(add).not.toHaveBeenCalled();
  });
  it("conserva aprobación tras un fallo de cola y reintenta con el mismo jobId", async () => {
    const { plan, reservationId } = await reserved();
    add.mockRejectedValueOnce(new Error("queue down"));
    expect((await approve(plan, reservationId)).statusCode).toBe(503);
    const approval = await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(approval.executionStatus).toBe("APPROVED");
    expect((await approve(plan, reservationId)).statusCode).toBe(202);
    expect(add.mock.calls[0]![2].jobId).toBe(add.mock.calls[1]![2].jobId);
    expect(add.mock.calls[1]![1].approvalId).toBe(approval.approvalId);
  });
  it("solo permite una aprobación ante confirmaciones concurrentes", async () => {
    const { plan, reservationId } = await reserved();
    const responses = await Promise.all([approve(plan, reservationId), approve(plan, reservationId)]);
    expect(responses.some((response) => [200, 202].includes(response.statusCode))).toBe(true);
    expect(responses.every((response) => [200, 202, 409].includes(response.statusCode))).toBe(true);
    const jobs = add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobs).size).toBe(1);
  });
  it("bloquea la ejecución si vence la aprobación o se revoca el rol", async () => {
    for (const reason of ["expired", "role"] as const) {
      const { plan, reservationId } = await reserved();
      const approvalId = (await approve(plan, reservationId)).json().approvalId;
      if (reason === "expired") await prisma.vlanReservation.update({ where: { id: reservationId }, data: { approvalExpiresAt: new Date(Date.now() - 1) } });
      else await prisma.user.update({ where: { id: owner.userId }, data: { role: "VISUALIZADOR" } });
      const write = vi.spyOn(client, "writeWifiNetwork");
      await processRemediation({ reservationId, approvalId });
      expect(write).not.toHaveBeenCalled();
      expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).executionStatus).toBe("BLOCKED");
      write.mockRestore();
    }
  });
  it("revalida el rol después de una lectura remota lenta", async () => {
    const { plan, reservationId } = await reserved();
    const approvalId = (await approve(plan, reservationId)).json().approvalId;
    vi.spyOn(client, "getWifiNetwork").mockImplementationOnce(async () => {
      await prisma.user.update({ where: { id: owner.userId }, data: { role: "VISUALIZADOR" } });
      return null;
    });
    const write = vi.spyOn(client, "writeWifiNetwork");
    await processRemediation({ reservationId, approvalId });
    expect(write).not.toHaveBeenCalled();
  });
  it("un trabajo sin aprobación o con aprobación falsa no consume una autorización válida", async () => {
    const { plan, reservationId } = await reserved();
    const approvalId = (await approve(plan, reservationId)).json().approvalId;
    const write = vi.spyOn(client, "writeWifiNetwork");
    await processRemediation({ reservationId, approvalId: "forged" });
    expect(write).not.toHaveBeenCalled();
    expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).executionStatus).toBe("QUEUED");
    await processRemediation({ reservationId, approvalId });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("no repite escrituras de resultado incierto", async () => {
    const { plan, reservationId } = await reserved();
    const approvalId = (await approve(plan, reservationId)).json().approvalId;
    const write = vi.spyOn(client, "writeWifiNetwork").mockRejectedValueOnce(new Error("connection lost"));
    await expect(processRemediation({ reservationId, approvalId })).rejects.toThrow("connection lost");
    expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).executionStatus).toBe("UNCERTAIN");
    await processRemediation({ reservationId, approvalId });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("un plan simulado no se ejecuta al cambiar a infraestructura real", async () => {
    const { plan, reservationId } = await reserved();
    const approvalId = (await approve(plan, reservationId)).json().approvalId;
    const write = vi.spyOn(client, "writeWifiNetwork");
    const previousMode = env.UNIFI_MODE;
    try {
      env.UNIFI_MODE = "live";
      await processRemediation({ reservationId, approvalId });
      expect(write).not.toHaveBeenCalled();
      expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).executionStatus).toBe("BLOCKED");
    } finally { env.UNIFI_MODE = previousMode; }
  });

  it("libera reservas pendientes sin repetir el trabajo y conserva múltiples liberaciones", async () => {
    const { plan, reservationId } = await reserved();
    const approvalId = (await approve(plan, reservationId)).json().approvalId;
    const write = vi.spyOn(client, "writeWifiNetwork");
    const release = (id: string) => post("/vlan/release", owner, { reservationId: id, version: plan.version, fingerprint: plan.fingerprint });
    expect((await release(reservationId)).statusCode).toBe(200);
    await processRemediation({ reservationId, approvalId });
    expect(write).not.toHaveBeenCalled();
    const second = await post("/vlan/reserve", owner, { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint });
    const secondId = second.json().results[0].reservationId;
    expect(secondId).not.toBe(reservationId);
    expect((await release(secondId)).statusCode).toBe(200);
    expect(await prisma.vlanReservation.count({ where: { changePlanId: plan.id, estado: "LIBERADA" } })).toBe(2);
  });
  it("conserva aplicaciones históricas de la misma VLAN sin bloquear cambios nuevos", async () => {
    const site = `history-${randomUUID()}`;
    for (const vlan of [88, 99, 88]) {
      const plan = await generateVlanPlan([{ nombre_red: "History", ssid: "History", vlan_id: vlan, banda: "5GHz", sitio: site }], client, owner);
      const result = await post("/vlan/reserve", owner, { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint });
      const reservationId = result.json().results[0].reservationId;
      const approvalId = (await approve(plan, reservationId)).json().approvalId;
      await processRemediation({ reservationId, approvalId });
      expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).executionStatus).toBe("APPLIED");
    }
    expect(await prisma.vlanReservation.count({ where: { sitio: site, vlanId: 88, estado: "APLICADA" } })).toBe(2);
  });
  it("no permite liberar una reserva incierta como si no hubiera escrito", async () => {
    const { plan, reservationId } = await reserved();
    await approve(plan, reservationId);
    await prisma.vlanReservation.update({ where: { id: reservationId }, data: { executionStatus: "UNCERTAIN" } });
    expect((await post("/vlan/release", owner, { reservationId, version: plan.version, fingerprint: plan.fingerprint })).statusCode).toBe(409);
    expect((await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } })).estado).toBe("RESERVADA");
  });

});
