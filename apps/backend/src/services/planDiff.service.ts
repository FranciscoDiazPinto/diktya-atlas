import { createHash, randomUUID } from "node:crypto";
import { CsvRowSchema, VlanPlanSchema, type CsvRow, type VlanPlan, type VlanPlanItem } from "@diktya-atlas/shared";
import { Prisma } from "@prisma/client";
import type { UnifiClient } from "../integrations/unifi/client.js";
import type { RequestContext } from "../auth/context.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { HttpError, NotFoundError } from "../lib/errors.js";

export const PLAN_TTL_MS = 30 * 60_000;
export const APPROVAL_TTL_MS = 10 * 60_000;

export function networkChangeActorFilter(role: RequestContext["role"], sites: readonly string[] = []): Prisma.UserWhereInput {
  if (role !== "TECNICO") return { role };
  return {
    role,
    AND: [...new Set(sites)].map((sitio) => ({ networkSites: { some: { sitio } } })),
  };
}

export async function authorizeNetworkChange(
  ctx: RequestContext,
  sites: readonly string[] = [],
  db: Pick<Prisma.TransactionClient, "user"> = prisma,
) {
  if (ctx.role === "ADMIN" || ctx.role === "TECNICO") {
    const user = await db.user.findFirst({
      where: { id: ctx.userId, ...networkChangeActorFilter(ctx.role, sites) },
      select: { id: true },
    });
    if (user) return;
  }
  throw new HttpError(403, "Tu cuenta no está autorizada para este cambio de red o para los sitios solicitados.");
}

// JSONB puede cambiar el orden de las claves: el hash usa una representación canónica.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function planFingerprint(plan: Omit<VlanPlan, "fingerprint">): string {
  const { id, version, items, creadoEn, expiresAt, source, targetFingerprint } = plan;
  return createHash("sha256").update(canonical({ id, version, items, creadoEn, expiresAt, source, targetFingerprint })).digest("hex");
}

export function validateStoredPlan(record: { id: string; version: number; fingerprint: string; payload: unknown; expiresAt: Date }): VlanPlan {
  const parsed = VlanPlanSchema.safeParse(record.payload);
  if (!parsed.success) throw new HttpError(409, "La propuesta guardada no es válida. Genera otro plan.");
  const plan = parsed.data;
  if (plan.id !== record.id || plan.version !== record.version || plan.fingerprint !== record.fingerprint ||
      new Date(plan.expiresAt).getTime() !== record.expiresAt.getTime() || planFingerprint(plan) !== record.fingerprint) {
    throw new HttpError(409, "La propuesta cambió. Genera y revisa otro plan.");
  }
  return plan;
}
export function currentTargetFingerprint(): string {
  return createHash("sha256").update(canonical({ mode: env.UNIFI_MODE, host: env.UNIFI_HOST ?? "", port: env.UNIFI_PORT ?? null,
    site: env.UNIFI_SITE, integrationHost: env.UNIFI_OS_HOST ?? "", transport: env.UNIFI_INTEGRATION_TRANSPORT,
    connectorHost: env.UNIFI_SITE_MANAGER_HOST_ID ?? "" })).digest("hex");
}
export function requireCurrentPlan(plan: VlanPlan, expected: { version: number; fingerprint: string }) {
  if (plan.source !== env.UNIFI_MODE || plan.targetFingerprint !== currentTargetFingerprint()) throw new HttpError(409, "Cambió el entorno o controlador del plan. Genera otra propuesta.");
  if (plan.version !== expected.version || plan.fingerprint !== expected.fingerprint) throw new HttpError(409, "El plan no coincide con la versión revisada.");
  if (new Date(plan.expiresAt).getTime() <= Date.now()) throw new HttpError(409, "El plan venció. Genera y revisa otro plan.");
}

export function bandasFromCsvBanda(banda: CsvRow["banda"]): Array<"2.4GHz" | "5GHz" | "6GHz"> {
  return banda === "ambas" ? ["2.4GHz", "5GHz"] : [banda];
}

/** Propone y persiste; no reserva ni escribe infraestructura. */
export async function generateVlanPlan(rows: CsvRow[], client: UnifiClient, ctx: RequestContext): Promise<VlanPlan> {
  const validatedRows = CsvRowSchema.array().min(1).max(500).parse(rows);
  const sites = validatedRows.map((row) => row.sitio);
  await authorizeNetworkChange(ctx, sites);
  const items: VlanPlanItem[] = [];
  const resources = new Set<string>();
  for (const row of validatedRows) {
    const resource = JSON.stringify([row.sitio, row.ssid]);
    if (resources.has(resource)) throw new HttpError(400, "El CSV contiene más de una propuesta para el mismo SSID y sitio.");
    resources.add(resource);
    const actual = await client.getWifiNetwork(row.sitio, row.ssid);
    items.push({
      sitio: row.sitio,
      redActual: actual ? { ssid: actual.ssid, vlanId: actual.vlanId } : null,
      redPropuesta: { ssid: row.ssid, vlanId: row.vlan_id, banda: row.banda },
      accion: !actual ? "crear" : actual.vlanId === row.vlan_id ? "sin_cambios" : "modificar",
    });
  }
  const now = new Date();
  const proposal = { id: randomUUID(), version: 1, source: env.UNIFI_MODE, targetFingerprint: currentTargetFingerprint(), items, creadoEn: now.toISOString(), expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString() };
  const plan: VlanPlan = { ...proposal, fingerprint: planFingerprint(proposal) };
  await prisma.$transaction(async (tx) => {
    await authorizeNetworkChange(ctx, sites, tx);
    await tx.networkChangePlan.create({ data: {
      id: plan.id, ownerId: ctx.userId, ownerRole: ctx.role, version: plan.version,
      fingerprint: plan.fingerprint, payload: plan as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(plan.expiresAt), createdAt: now,
    } });
    await tx.auditLog.create({ data: { actorId: ctx.userId, workerName: "network-change", toolName: "propose_vlan_plan",
      parametros: { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint }, resultado: { items: items.length }, exitoso: true } });
  });
  return plan;
}

export async function getPlan(planId: string, ctx: RequestContext): Promise<VlanPlan> {
  await authorizeNetworkChange(ctx);
  const record = await prisma.networkChangePlan.findFirst({ where: { id: planId, ownerId: ctx.userId, ownerRole: ctx.role } });
  if (!record) throw new NotFoundError("plan de cambios");
  return validateStoredPlan(record);
}
