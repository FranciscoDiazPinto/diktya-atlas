import type { CsvRowResult, VlanPlan, Role, ApModel, CoveragePoint, CoverageGapCell } from "@diktya-atlas/shared";

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
}

export type LoginResponse =
  | { status: "ok"; accessToken: string; user: PublicUser }
  | { status: "2fa_required"; loginToken: string }
  | { status: "2fa_setup_required"; setupToken: string };

export interface Setup2faResponse {
  secret: string;
  otpauthUrl: string;
}

export interface SessionResponse {
  status: "ok";
  accessToken: string;
  user: PublicUser;
}

/**
 * Estas formas reflejan lo que las rutas del backend devuelven de verdad
 * (filas de Prisma, no los modelos de dominio Zod de @diktya-atlas/shared
 * — distinto casing de status/severidad). CsvRowResult y VlanPlan sí
 * salen tal cual del paquete compartido porque csvIngestion/planDiff los
 * usan directo.
 */

export type ApiNodeStatus = "ONLINE" | "OFFLINE" | "ADOPTING" | "UNKNOWN";
export type ApiAlertSeverity = "INFO" | "ADVERTENCIA" | "CRITICO";
export type ApiTicketStatus = "ABIERTO" | "EN_PROGRESO" | "ESCALADO" | "RESUELTO";
export type ApiTicketEventType =
  | "CREADO"
  | "NOTIFICADO"
  | "REMEDIACION_INTENTADA"
  | "ESCALADO"
  | "RESUELTO"
  | "REABIERTO";

export interface ApiNetworkNode {
  id: string;
  externalId: string;
  sitio: string;
  nombre: string;
  modelo: string | null;
  status: ApiNodeStatus;
  senalDbm: number | null;
  clientesConectados: number;
  uptimeSegundos: number | null;
  ultimaVezVisto: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWifiNetwork {
  id: string;
  nodeId: string | null;
  sitio: string;
  ssid: string;
  vlanId: number;
  bandas: string[];
  clientesConectados: number;
  throughputMbps: number | null;
}

export interface ApiAlert {
  id: string;
  sitio: string;
  nodeId: string | null;
  severidad: ApiAlertSeverity;
  mensaje: string;
  createdAt: string;
  ticketId: string | null;
}

export interface ApiTicket {
  id: string;
  titulo: string;
  descripcion: string;
  severidad: ApiAlertSeverity;
  estado: ApiTicketStatus;
  nodoAfectadoId: string | null;
  vlanReservationId: string | null;
  asignadoAId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTicketEvent {
  id: string;
  ticketId: string;
  tipo: ApiTicketEventType;
  detalle: string;
  createdAt: string;
}

export interface NetworkStatusSummary {
  totalNodos: number;
  online: number;
  offline: number;
  adoptando: number;
  alertasPorSeveridad: Record<ApiAlertSeverity, number>;
  nodos: ApiNetworkNode[];
  alertasRecientes: ApiAlert[];
}

/**
 * Estado en vivo del cliente OPNsense (mock hoy — fase 2 para real, ver
 * integrations/opnsense). A diferencia de NetworkStatusSummary (que lee de
 * Postgres, sincronizado desde UniFi), esto viene directo del dominio del
 * cliente en cada request, por eso el shape difiere un poco (status en
 * minúsculas, `alertas` en vez de `alertasRecientes`, sin `adoptando`).
 */
export interface OpnsenseNode {
  id: string;
  sitio: string;
  nombre: string;
  modelo?: string;
  status: "online" | "offline" | "adopting" | "unknown";
  senalDbm?: number;
  clientesConectados: number;
  uptimeSegundos?: number;
  ultimaVezVisto: string;
  ssidsTransmitidos: string[];
}

export interface OpnsenseAlert {
  id: string;
  sitio: string;
  nodeId?: string;
  severidad: ApiAlertSeverity;
  mensaje: string;
  creadoEn: string;
  ticketId?: string;
}

export interface OpnsenseStatusSummary {
  totalNodos: number;
  online: number;
  offline: number;
  alertasPorSeveridad: Record<ApiAlertSeverity, number>;
  nodos: OpnsenseNode[];
  alertas: OpnsenseAlert[];
}

export interface ApNodeDetail extends ApiNetworkNode {
  wifiNetworks: ApiWifiNetwork[];
  alerts: ApiAlert[];
}

export interface TicketDetail extends ApiTicket {
  eventos: ApiTicketEvent[];
  alerts: ApiAlert[];
}

export interface CsvUploadResponse {
  filas: CsvRowResult[];
  plan: VlanPlan | null;
}

export interface VlanReserveItemResult {
  sitio: string;
  ssid: string;
  vlanId: number;
  ok: boolean;
  reservationId?: string;
  error?: string;
}

export interface VlanReserveResponse {
  planId: string;
  results: VlanReserveItemResult[];
}

export interface VlanApplyResponse {
  encolado: boolean;
  jobId?: string;
  reservationId: string;
}

export interface ChatToolResult {
  tool: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  statusCode?: number;
}

export interface ChatResponse {
  mensaje: string;
  toolResults: ChatToolResult[];
}

// --- Mapeo de planos y ubicación de APs ---

export type DeploymentEstado = "PLANIFICACION" | "EN_CURSO" | "FINALIZADO";

export interface ApiVenue {
  id: string;
  nombre: string;
  planFilePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEventDeployment {
  id: string;
  nombre: string;
  fecha: string;
  estado: DeploymentEstado;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEventDeploymentDetail extends ApiEventDeployment {
  zonas: ApiEventZone[];
}

export interface ApiEventZone {
  id: string;
  eventDeploymentId: string;
  venueId: string;
  nombreZona: string;
  planFilePath: string | null;
  pixelesPorMetro: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEventZoneDetail extends ApiEventZone {
  venue: ApiVenue;
  aps: ApiApPlacement[];
}

export interface ApiApPlacement {
  id: string;
  eventZoneId: string;
  modelo: ApModel;
  x: number;
  y: number;
  radioMetros: number;
  rackLabel: string | null;
  networkNodeId: string | null;
}

export type { CoveragePoint, CoverageGapCell };

