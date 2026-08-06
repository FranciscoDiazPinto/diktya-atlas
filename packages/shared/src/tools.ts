import { z } from "zod";
import { RoleSchema } from "./roles.js";
import { AlertSeveritySchema } from "./network.js";
import { CsvRowSchema } from "./vlan.js";
import { ApModelSchema } from "./mapping.js";

/**
 * Contratos de las tools que el LLM puede invocar. El LLM NUNCA ejecuta
 * código arbitrario: solo puede llamar a una de estas funciones predefinidas,
 * y solo si la tool está en la lista filtrada por rol (ver registry en el
 * backend). Los esquemas viven aquí para que el backend y, a futuro, el
 * frontend (para renderizar tarjetas de resultado) compartan el mismo tipo.
 */

export const GetNetworkStatusInputSchema = z.object({
  sitio: z.string().optional(),
});

export const GetApDetailInputSchema = z.object({
  nodeId: z.string(),
});

export const DiagnoseNodeInputSchema = z.object({
  nodeId: z.string(),
});

export const GetNodeHistoryInputSchema = z.object({
  nodeId: z.string(),
  limit: z.number().int().positive().max(50).optional(),
});

export const ProposeVlanPlanInputSchema = z.object({
  csvRows: z.array(CsvRowSchema),
});

export const ReserveVlanInputSchema = z.object({
  planId: z.string(),
});

export const ApplyVlanPlanInputSchema = z.object({
  reservationId: z.string(),
});

export const CreateTicketInputSchema = z.object({
  titulo: z.string(),
  descripcion: z.string(),
  severidad: AlertSeveritySchema,
  nodoAfectado: z.string().optional(),
  vlanReservationId: z.string().optional(),
});

export const AssignTicketInputSchema = z.object({
  ticketId: z.string(),
  userId: z.string(),
});

export const ListOpenIssuesInputSchema = z.object({
  sitio: z.string().optional(),
  severidad: AlertSeveritySchema.optional(),
});

export const GetActivityDigestInputSchema = z.object({
  // ISO date/datetime; si se omiten, el backend usa "hoy" (00:00 -> ahora).
  desde: z.string().optional(),
  hasta: z.string().optional(),
  eventDeploymentId: z.string().optional(),
});

export const GetAvailabilityInputSchema = z.object({
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

export const EscalateTicketInputSchema = z.object({
  ticketId: z.string(),
  motivo: z.string(),
});

export const NotifyTechniciansInputSchema = z.object({
  mensaje: z.string(),
  severidad: AlertSeveritySchema,
  sitio: z.string().optional(),
});

export const ListEventsInputSchema = z.object({
  nombre: z.string().optional(),
});

export const ListEventZonesInputSchema = z.object({
  eventDeploymentId: z.string(),
});

export const GetCoverageAtPointInputSchema = z.object({
  eventZoneId: z.string(),
  x: z.number(),
  y: z.number(),
});

export const FindCoverageGapsInputSchema = z.object({
  eventZoneId: z.string(),
  planWidthPx: z.number().positive(),
  planHeightPx: z.number().positive(),
  cellSizeMeters: z.number().positive().optional(),
});

export const PlaceApInputSchema = z.object({
  eventZoneId: z.string(),
  modelo: ApModelSchema,
  x: z.number(),
  y: z.number(),
  radioMetros: z.number().nonnegative().optional(),
  rackLabel: z.string().optional(),
});

export const toolSchemas = {
  get_network_status: GetNetworkStatusInputSchema,
  get_ap_detail: GetApDetailInputSchema,
  diagnose_node: DiagnoseNodeInputSchema,
  get_node_history: GetNodeHistoryInputSchema,
  get_activity_digest: GetActivityDigestInputSchema,
  get_availability: GetAvailabilityInputSchema,
  list_open_issues: ListOpenIssuesInputSchema,
  propose_vlan_plan: ProposeVlanPlanInputSchema,
  reserve_vlan: ReserveVlanInputSchema,
  apply_vlan_plan: ApplyVlanPlanInputSchema,
  create_ticket: CreateTicketInputSchema,
  escalate_ticket: EscalateTicketInputSchema,
  assign_ticket: AssignTicketInputSchema,
  notify_technicians: NotifyTechniciansInputSchema,
  list_events: ListEventsInputSchema,
  list_event_zones: ListEventZonesInputSchema,
  get_coverage_at_point: GetCoverageAtPointInputSchema,
  find_coverage_gaps: FindCoverageGapsInputSchema,
  place_ap: PlaceApInputSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;

/**
 * Qué tools puede invocar cada rol. VISUALIZADOR solo puede consultar
 * estado; nunca proponer/reservar/aplicar cambios ni crear tickets.
 * Esta tabla es la fuente de verdad que consume llm/tools/registry.ts.
 */
export const toolsByRole: Record<z.infer<typeof RoleSchema>, ToolName[]> = {
  ADMIN: [
    "get_network_status",
    "get_ap_detail",
    "diagnose_node",
    "get_node_history",
    "get_activity_digest",
    "get_availability",
    "list_open_issues",
    "propose_vlan_plan",
    "reserve_vlan",
    "apply_vlan_plan",
    "create_ticket",
    "escalate_ticket",
    "assign_ticket",
    "notify_technicians",
    "list_events",
    "list_event_zones",
    "get_coverage_at_point",
    "find_coverage_gaps",
    "place_ap",
  ],
  TECNICO: [
    "get_network_status",
    "get_ap_detail",
    "diagnose_node",
    "get_node_history",
    "get_activity_digest",
    "list_open_issues",
    "propose_vlan_plan",
    "reserve_vlan",
    "apply_vlan_plan",
    "create_ticket",
    "assign_ticket",
    "notify_technicians",
    "list_events",
    "list_event_zones",
    "get_coverage_at_point",
    "find_coverage_gaps",
    "place_ap",
  ],
  VISUALIZADOR: [
    "get_network_status",
    "get_activity_digest",
    "list_open_issues",
    "list_events",
    "list_event_zones",
    "get_coverage_at_point",
    "find_coverage_gaps",
  ],
};
