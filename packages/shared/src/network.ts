import { z } from "zod";

/**
 * Modelo de dominio propio, desacoplado del formato crudo de UniFi/OPNsense.
 * Los clientes de integración (apps/backend/src/integrations/*) normalizan
 * hacia este contrato; el resto del sistema nunca ve el formato del proveedor.
 */

export const NodeStatusSchema = z.enum(["online", "offline", "adopting", "unknown"]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const DeviceTypeSchema = z.enum(["AP", "SWITCH", "GATEWAY", "UPS", "OTRO"]);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const NetworkNodeSchema = z.object({
  id: z.string(),
  sitio: z.string(),
  nombre: z.string(),
  modelo: z.string().optional(),
  tipoDispositivo: DeviceTypeSchema.default("OTRO"),
  status: NodeStatusSchema,
  senalDbm: z.number().optional(),
  clientesConectados: z.number().int().nonnegative(),
  uptimeSegundos: z.number().int().nonnegative().optional(),
  ultimaVezVisto: z.string().datetime(),
  ssidsTransmitidos: z.array(z.string()),
});
export type NetworkNode = z.infer<typeof NetworkNodeSchema>;

export const WifiNetworkSchema = z.object({
  id: z.string(),
  sitio: z.string(),
  ssid: z.string(),
  vlanId: z.number().int(),
  bandas: z.array(z.enum(["2.4GHz", "5GHz", "6GHz"])),
  clientesConectados: z.number().int().nonnegative(),
  throughputMbps: z.number().nonnegative().optional(),
});
export type WifiNetwork = z.infer<typeof WifiNetworkSchema>;

export const AlertSeveritySchema = z.enum(["INFO", "ADVERTENCIA", "CRITICO"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  sitio: z.string(),
  nodeId: z.string().optional(),
  severidad: AlertSeveritySchema,
  mensaje: z.string(),
  creadoEn: z.string().datetime(),
  ticketId: z.string().optional(),
});
export type Alert = z.infer<typeof AlertSchema>;
