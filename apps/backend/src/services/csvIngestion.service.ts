import { parse } from "csv-parse/sync";
import { CsvRowSchema, type CsvRowResult } from "@diktya-atlas/shared";

/**
 * Valida fila por fila — un error en una fila no invalida el resto. El
 * llamador (routes/csv.ts) decide qué hacer con las filas inválidas
 * (mostrarlas al usuario, no generar plan hasta corregirlas, etc.), acá
 * solo se reporta.
 */
export function parseCsvRows(content: string): CsvRowResult[] {
  let records: Record<string, string>[];
  try {
    records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(`CSV inválido: ${(err as Error).message}`);
  }

  return records.map((record, index) => {
    // +2: la fila 1 es el header, y los usuarios cuentan filas desde 1.
    const fila = index + 2;
    const result = CsvRowSchema.safeParse(record);
    if (result.success) {
      return { fila, ok: true, datos: result.data, errores: [] };
    }
    return {
      fila,
      ok: false,
      errores: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  });
}
