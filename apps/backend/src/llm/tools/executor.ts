import type { ToolName } from "@diktya-atlas/shared";
import type { RequestContext } from "../../auth/context.js";
import { isToolAllowedForRole } from "./registry.js";
import { toolSchemaFor } from "./schemas.js";
import { recordAudit } from "../../services/audit.service.js";
import { NotAuthorizedForRoleError } from "../../lib/errors.js";
import { getUnifiClient } from "../../integrations/unifi/index.js";
import { getNetworkStatusSummary, getApDetail } from "../../services/network.service.js";
import { generateVlanPlan } from "../../services/planDiff.service.js";
import { reserveVlanPlanItems, enqueueApplyVlanPlan } from "../../services/vlanFlow.service.js";
import { createTicket, escalateTicket } from "../../services/ticket.service.js";
import { notifyTechnicians } from "../../services/notification.service.js";
import { getCoverageAtPoint, findCoverageGaps } from "../../services/coverage.service.js";
import { placeAp } from "../../services/apPlacement.service.js";
import { listEventDeployments } from "../../services/eventDeployment.service.js";
import { listEventZones } from "../../services/eventZone.service.js";
import type { ApModel } from "@prisma/client";

type ToolHandler = (args: never, ctx: RequestContext) => Promise<unknown>;

/**
 * El LLM NUNCA ejecuta código arbitrario: solo puede disparar una de estas
 * funciones predefinidas, y solo después de pasar el filtro de rol
 * (registry.ts) + esta segunda validación server-side (defensa en
 * profundidad — nunca confiar en que "el LLM decidió no hacerlo").
 * apply_vlan_plan encola en remediation-queue; ninguna de estas escribe
 * directo en UniFi/OPNsense.
 */
const handlers: Record<ToolName, ToolHandler> = {
  get_network_status: (async (args: { sitio?: string }) => getNetworkStatusSummary(args.sitio)) as ToolHandler,
  get_ap_detail: (async (args: { nodeId: string }) => getApDetail(args.nodeId)) as ToolHandler,
  propose_vlan_plan: (async (args: { csvRows: never }) =>
    generateVlanPlan(args.csvRows as never, getUnifiClient())) as ToolHandler,
  reserve_vlan: (async (args: { planId: string }, ctx: RequestContext) =>
    reserveVlanPlanItems(args.planId, ctx.userId)) as ToolHandler,
  apply_vlan_plan: (async (args: { reservationId: string }) =>
    enqueueApplyVlanPlan(args.reservationId)) as ToolHandler,
  create_ticket: (async (args) => createTicket(args as never)) as ToolHandler,
  escalate_ticket: (async (args: { ticketId: string; motivo: string }) =>
    escalateTicket(args.ticketId, args.motivo)) as ToolHandler,
  notify_technicians: (async (args) => {
    await notifyTechnicians(args as never);
    return { enviado: true };
  }) as ToolHandler,
  list_events: (async (args: { nombre?: string }) => listEventDeployments(args.nombre)) as ToolHandler,
  list_event_zones: (async (args: { eventDeploymentId: string }) =>
    listEventZones(args.eventDeploymentId)) as ToolHandler,
  get_coverage_at_point: (async (args: { eventZoneId: string; x: number; y: number }) =>
    getCoverageAtPoint(args.eventZoneId, args.x, args.y)) as ToolHandler,
  find_coverage_gaps: (async (args: {
    eventZoneId: string;
    planWidthPx: number;
    planHeightPx: number;
    cellSizeMeters?: number;
  }) => findCoverageGaps(args.eventZoneId, args.planWidthPx, args.planHeightPx, args.cellSizeMeters)) as ToolHandler,
  place_ap: (async (args: {
    eventZoneId: string;
    modelo: ApModel;
    x: number;
    y: number;
    radioMetros?: number;
    rackLabel?: string;
  }) => placeAp(args)) as ToolHandler,
};

export async function executeTool(toolName: string, rawArgs: unknown, ctx: RequestContext): Promise<unknown> {
  if (!isToolAllowedForRole(ctx.role, toolName)) {
    await recordAudit({
      actorId: ctx.userId,
      workerName: "chat-orchestrator",
      toolName,
      parametros: rawArgs,
      resultado: { error: "no_autorizado_para_rol" },
      exitoso: false,
    });
    throw new NotAuthorizedForRoleError(ctx.role, toolName);
  }

  const schema = toolSchemaFor(toolName as ToolName);
  const args = schema.parse(rawArgs);

  try {
    const output = await handlers[toolName as ToolName](args as never, ctx);
    await recordAudit({
      actorId: ctx.userId,
      workerName: "chat-orchestrator",
      toolName,
      parametros: args,
      resultado: output,
      exitoso: true,
    });
    return output;
  } catch (err) {
    await recordAudit({
      actorId: ctx.userId,
      workerName: "chat-orchestrator",
      toolName,
      parametros: args,
      resultado: { error: err instanceof Error ? err.message : String(err) },
      exitoso: false,
    });
    throw err;
  }
}
