import { z } from "zod";

/**
 * Fila de entrada del CSV de carga (listado de redes + VLAN a asignar).
 * Validación fila por fila: un error en una fila no invalida el resto.
 */
export const CsvRowSchema = z.object({
  nombre_red: z.string().min(1),
  vlan_id: z.coerce.number().int().min(1).max(4094),
  ssid: z.string().min(1),
  banda: z.enum(["2.4GHz", "5GHz", "6GHz", "ambas"]),
  sitio: z.string().min(1),
});
export type CsvRow = z.infer<typeof CsvRowSchema>;

export const CsvRowResultSchema = z.object({
  fila: z.number().int(),
  ok: z.boolean(),
  datos: CsvRowSchema.optional(),
  errores: z.array(z.string()),
});
export type CsvRowResult = z.infer<typeof CsvRowResultSchema>;

/** Un ítem del diff entre el estado actual (vía API UniFi) y lo solicitado. */
export const VlanPlanItemSchema = z.object({
  sitio: z.string(),
  redActual: z
    .object({ ssid: z.string(), vlanId: z.number().int() })
    .nullable(),
  redPropuesta: z.object({ ssid: z.string(), vlanId: z.number().int(), banda: z.string() }),
  accion: z.enum(["crear", "modificar", "sin_cambios"]),
});
export type VlanPlanItem = z.infer<typeof VlanPlanItemSchema>;

export const VlanPlanSchema = z.object({
  id: z.string(),
  items: z.array(VlanPlanItemSchema),
  creadoEn: z.string().datetime(),
});
export type VlanPlan = z.infer<typeof VlanPlanSchema>;

export const VlanReservationStatusSchema = z.enum(["RESERVADA", "APLICADA", "LIBERADA"]);
export type VlanReservationStatus = z.infer<typeof VlanReservationStatusSchema>;

export const VlanReservationSchema = z.object({
  id: z.string(),
  vlanId: z.number().int(),
  redSolicitada: z.string(),
  sitio: z.string(),
  estado: VlanReservationStatusSchema,
  reservadoPor: z.string(),
  creadoEn: z.string().datetime(),
});
export type VlanReservation = z.infer<typeof VlanReservationSchema>;
