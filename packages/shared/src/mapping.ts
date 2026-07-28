import { z } from "zod";

/**
 * Modelos reales de equipo de borde usados en despliegues de evento
 * (racks perimetrales). Solo U6_MESH/U7_CAMPUS son APs con radio de
 * cobertura — el resto son switches (Pro Max 24 de rack, familia Flex).
 */
export const ApModelSchema = z.enum(["U6_MESH", "U7_CAMPUS", "PRO_MAX_24", "FLEX_MINI", "FLEX", "FLEX_ULTRA"]);
export type ApModel = z.infer<typeof ApModelSchema>;

export const CoveragePointSchema = z.object({
  cubierto: z.boolean(),
  apsEnRango: z.array(z.object({ id: z.string(), modelo: z.string(), distanciaMetros: z.number() })),
});
export type CoveragePoint = z.infer<typeof CoveragePointSchema>;

export const CoverageGapCellSchema = z.object({ x: z.number(), y: z.number() });
export type CoverageGapCell = z.infer<typeof CoverageGapCellSchema>;
