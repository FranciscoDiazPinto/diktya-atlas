import type { CsvRowResult, VlanPlan } from "@diktya-atlas/shared";

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
