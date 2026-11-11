import { randomUUID } from "node:crypto";
import type { RequestContext } from "../auth/context.js";
import { prisma } from "../db/client.js";
import { APPROVAL_TTL_MS, authorizeNetworkChange, getPlan, requireCurrentPlan, validateStoredPlan, bandasFromCsvBanda } from "./planDiff.service.js";
import { reserveVlan, getReservation } from "./vlanReservation.service.js";
import { ReservationConflictError, HttpError } from "../lib/errors.js";
import { remediationQueue } from "../workers/queues.js";
import type { CsvRow } from "@diktya-atlas/shared";

export interface PlanReference { version: number; fingerprint: string }
export interface ReserveItemResult {
  sitio: string; ssid: string; vlanId: number; ok: boolean; reservationId?: string; error?: string;
}

export async function reserveVlanPlanItems(planId: string, ctx: RequestContext, expected: PlanReference) {
  const plan = await getPlan(planId, ctx);
  requireCurrentPlan(plan, expected);
  const results: ReserveItemResult[] = [];
  for (const item of plan.items) {
    if (item.accion === "sin_cambios") continue;
    try {
      // Recuperar una reserva propia del mismo plan permite retomar la interfaz.
      const existing = await prisma.vlanReservation.findFirst({ where: {
        changePlanId: plan.id, reservadoPorId: ctx.userId, sitio: item.sitio,
        redSolicitada: item.redPropuesta.ssid, estado: { in: ["RESERVADA", "APLICADA"] },
      } });
      const reservation = existing ?? await reserveVlan({
        vlanId: item.redPropuesta.vlanId, sitio: item.sitio, redSolicitada: item.redPropuesta.ssid,
        reservadoPorId: ctx.userId, plan, changePlanId: plan.id,
      });
      results.push({ sitio: item.sitio, ssid: item.redPropuesta.ssid, vlanId: item.redPropuesta.vlanId, ok: true, reservationId: reservation.id });
    } catch (err) {
      if (!(err instanceof ReservationConflictError)) throw err;
      results.push({ sitio: item.sitio, ssid: item.redPropuesta.ssid, vlanId: item.redPropuesta.vlanId, ok: false, error: err.message });
    }
  }
  return { planId, results };
}

async function ownedReservedPlan(reservationId: string, ctx: RequestContext, expected: PlanReference) {
  await authorizeNetworkChange(ctx);
  const reservation = await prisma.vlanReservation.findFirst({ where: { id: reservationId, reservadoPorId: ctx.userId } });
  if (!reservation || !reservation.changePlanId) throw new HttpError(404, "Reserva no encontrada");
  const plan = await getPlan(reservation.changePlanId, ctx);
  requireCurrentPlan(plan, expected);
  // Vincular la aprobación también a la instantánea y a la fila reservada.
  validateStoredPlan({ ...plan, payload: reservation.planSnapshot, expiresAt: new Date(plan.expiresAt) });
  const item = plan.items.find((row) => row.sitio === reservation.sitio && row.redPropuesta.ssid === reservation.redSolicitada && row.redPropuesta.vlanId === reservation.vlanId);
  if (!item || item.accion === "sin_cambios") throw new HttpError(409, "La reserva no coincide con una fila modificable del plan.");
  return { reservation, plan, item };
}

/** Esta entrada solo se invoca desde la confirmación HTTP, nunca desde el LLM. */
export async function enqueueApplyVlanPlan(reservationId: string, ctx: RequestContext, expected: PlanReference) {
  const { reservation, plan } = await ownedReservedPlan(reservationId, ctx, expected);
  if (reservation.estado !== "RESERVADA" && reservation.executionStatus !== "APPLIED") throw new HttpError(409, "La reserva no puede aprobarse en su estado actual.");
  let approval = reservation;
  if (!approval.approvalId) {
    const now = new Date();
    requireCurrentPlan(plan, expected);
    const approvalId = randomUUID();
    approval = await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: ctx.userId } });
      if (!actor || actor.role !== ctx.role || !["ADMIN", "TECNICO"].includes(actor.role)) throw new HttpError(403, "Tu acceso cambió antes de confirmar.");
      const claimed = await tx.vlanReservation.updateMany({
        where: { id: reservationId, reservadoPorId: ctx.userId, changePlanId: plan.id, estado: "RESERVADA", approvalId: null },
        data: { approvalId, approvedById: ctx.userId, approvedRole: ctx.role, approvedPlanVersion: plan.version,
          approvedFingerprint: plan.fingerprint, approvedAt: now,
          approvalExpiresAt: new Date(Math.min(new Date(plan.expiresAt).getTime(), now.getTime() + APPROVAL_TTL_MS)), executionStatus: "APPROVED" },
      });
      if (!claimed.count) throw new HttpError(409, "Otra confirmación tomó esta reserva. Recarga el plan.");
      await tx.auditLog.create({ data: { actorId: ctx.userId, workerName: "http-approval", toolName: "approve_vlan_plan",
        parametros: { reservationId, planId: plan.id, version: plan.version, fingerprint: plan.fingerprint, approvalId },
        resultado: { estado: "APPROVED" }, exitoso: true } });
      return tx.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    });
  }
  if (approval.approvedById !== ctx.userId || approval.approvedRole !== ctx.role || approval.approvedPlanVersion !== plan.version || approval.approvedFingerprint !== plan.fingerprint) {
    throw new HttpError(409, "La aprobación no corresponde a tu identidad y a este plan.");
  }
  if (approval.executionStatus !== "APPROVED") {
    return { encolado: false, reservationId, approvalId: approval.approvalId!, estado: approval.executionStatus };
  }
  if (!approval.approvalExpiresAt || approval.approvalExpiresAt.getTime() <= Date.now()) throw new HttpError(409, "La aprobación venció. Genera otro plan.");
  const jobId = `vlan-approval-${approval.approvalId}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      remediationQueue.add("apply", { reservationId, approvalId: approval.approvalId! }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 2000 } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("queue timeout")), 8000); }),
    ]);
  } catch {
    // Aprobación durable + jobId estable: reintentar no crea otra aprobación ni otro trabajo.
    throw new HttpError(503, "La aprobación se guardó, pero no se pudo confirmar el encolado. Reintenta la misma fila.");
  } finally { if (timer) clearTimeout(timer); }
  await prisma.vlanReservation.updateMany({ where: { id: reservationId, approvalId: approval.approvalId, executionStatus: "APPROVED" }, data: { executionStatus: "QUEUED" } });
  return { encolado: true, jobId, reservationId, approvalId: approval.approvalId!, estado: "QUEUED" };
}

/** Revalidar también después de esperas externas, inmediatamente antes de escribir. */
export async function getApprovedExecution(reservationId: string, approvalId: string) {
  const reservation = await getReservation(reservationId);
  if (!approvalId || reservation.approvalId !== approvalId || !reservation.approvedById || !reservation.approvedRole ||
      !reservation.approvedPlanVersion || !reservation.approvedFingerprint || !reservation.approvalExpiresAt) {
    throw new HttpError(403, "El trabajo no tiene una aprobación válida.");
  }
  const ctx: RequestContext = { userId: reservation.approvedById, role: reservation.approvedRole };
  const execution = await ownedReservedPlan(reservationId, ctx, { version: reservation.approvedPlanVersion, fingerprint: reservation.approvedFingerprint });
  if (reservation.approvalExpiresAt.getTime() <= Date.now()) throw new HttpError(409, "La aprobación venció antes de ejecutar.");
  if (reservation.estado !== "RESERVADA" || !["APPROVED", "QUEUED"].includes(reservation.executionStatus ?? "")) throw new HttpError(409, "La aprobación ya fue tomada o finalizó.");
  return { ...execution, ctx, input: {
    sitio: execution.item.sitio, ssid: execution.item.redPropuesta.ssid, vlanId: execution.item.redPropuesta.vlanId,
    bandas: bandasFromCsvBanda(execution.item.redPropuesta.banda as CsvRow["banda"]),
  } };
}

export async function getVlanPlanDetail(planId: string, ctx: RequestContext) {
  const plan = await getPlan(planId, ctx);
  const reservations = await prisma.vlanReservation.findMany({ where: { changePlanId: plan.id, reservadoPorId: ctx.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, sitio: true, redSolicitada: true, vlanId: true, estado: true, approvalId: true,
      executionStatus: true, approvedAt: true, approvalExpiresAt: true } });
  return { plan, reservations };
}


/** Liberar no revierte infraestructura. Lo ejecutándose o incierto requiere conciliación. */
export async function releaseApprovedReservation(reservationId: string, ctx: RequestContext, expected: PlanReference) {
  await authorizeNetworkChange(ctx);
  const reservation = await prisma.vlanReservation.findFirst({ where: { id: reservationId, reservadoPorId: ctx.userId } });
  if (!reservation?.changePlanId) throw new HttpError(404, "Reserva no encontrada");
  const plan = await getPlan(reservation.changePlanId, ctx);
  if (plan.version !== expected.version || plan.fingerprint !== expected.fingerprint) throw new HttpError(409, "El plan no coincide con la versión revisada.");
  await prisma.$transaction(async (tx) => {
    const result = await tx.vlanReservation.updateMany({ where: { id: reservationId, reservadoPorId: ctx.userId, reservadoPor: { role: ctx.role }, estado: "RESERVADA",
      OR: [{ executionStatus: null }, { executionStatus: { in: ["APPROVED", "QUEUED", "BLOCKED", "FAILED"] } }] },
      data: { estado: "LIBERADA", executionStatus: "BLOCKED" } });
    if (!result.count) throw new HttpError(409, "No se puede liberar una reserva ejecutándose, aplicada o con resultado incierto.");
    await tx.auditLog.create({ data: { actorId: ctx.userId, workerName: "http-approval", toolName: "release_vlan_reservation",
      parametros: { reservationId, planId: plan.id }, resultado: { estado: "LIBERADA" }, exitoso: true } });
  });
  return { reservationId, estado: "LIBERADA" };
}
