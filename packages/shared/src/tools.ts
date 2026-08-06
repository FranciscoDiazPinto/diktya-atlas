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
  propose_vlan_plan: ProposeVlanPlanInputSchema,
  reserve_vlan: ReserveVlanInputSchema,
  apply_vlan_plan: ApplyVlanPlanInputSchema,
  create_ticket: CreateTicketInputSchema,
  escalate_ticket: EscalateTicketInputSchema,
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
    "propose_vlan_plan",
    "reserve_vlan",
    "apply_vlan_plan",
    "create_ticket",
    "escalate_ticket",
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
    "propose_vlan_plan",
    "reserve_vlan",
    "apply_vlan_plan",
    "create_ticket",
    "notify_technicians",
    "list_events",
    "list_event_zones",
    "get_coverage_at_point",
    "find_coverage_gaps",
    "place_ap",
  ],
  VISUALIZADOR: [
    "get_network_status",
    "list_events",
    "list_event_zones",
    "get_coverage_at_point",
    "find_coverage_gaps",
  ],
};
