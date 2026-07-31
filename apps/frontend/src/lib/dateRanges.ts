export type RangoPreset = "hoy" | "ayer" | "7dias";

export const RANGO_PRESETS: Array<{ id: RangoPreset; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7dias", label: "Últimos 7 días" },
];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/**
 * Usa `new Date()` — SIEMPRE memoizar el resultado (`useMemo` keyed en el
 * preset) en el componente que la llama. Sin eso, cada render genera un
 * timestamp nuevo -> queryKey nueva -> refetch -> re-render -> loop
 * infinito (confirmado en vivo una vez, tumbó el rate limit en segundos).
 */
export function rangoFor(preset: RangoPreset): { desde: string; hasta: string } {
  const ahora = new Date();
  if (preset === "hoy") return { desde: startOfDay(ahora).toISOString(), hasta: ahora.toISOString() };
  if (preset === "ayer") {
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    return { desde: startOfDay(ayer).toISOString(), hasta: endOfDay(ayer).toISOString() };
  }
  const hace7 = new Date(ahora);
  hace7.setDate(hace7.getDate() - 7);
  return { desde: startOfDay(hace7).toISOString(), hasta: ahora.toISOString() };
}
