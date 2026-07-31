import { cn } from "../../lib/cn.js";
import type { StatusTone } from "./StatusDot.js";

const METER_FILL_CLASS: Record<StatusTone, string> = {
  good: "bg-status-good",
  warning: "bg-status-warning",
  serious: "bg-status-serious",
  critical: "bg-status-critical",
  muted: "bg-slate-400 dark:bg-slate-600",
};

/** Disponibilidad de red: umbrales estándar del rubro, no arbitrarios por UI. */
export function toneParaDisponibilidad(pct: number | null): StatusTone {
  if (pct === null) return "muted";
  if (pct >= 99.5) return "good";
  if (pct >= 97) return "warning";
  return "serious";
}

export interface MeterProps {
  label: string;
  /** 0–100, o null cuando no hay datos en el rango ("sin datos" ≠ "0%"). */
  pct: number | null;
  tone?: StatusTone;
  className?: string;
}

/**
 * Un solo ratio contra un límite -> Meter (dataviz/choosing-a-form.md).
 * Track en tinta neutra (no hay ramp de pasos claros/oscuros por tono en
 * esta paleta, así que se usa el mismo neutro de borde que el resto de la
 * UI); el fill es lo único que lleva el tono, siempre con el % como texto
 * al lado — nunca color solo.
 */
export function Meter({ label, pct, tone, className }: MeterProps) {
  const resolvedTone = tone ?? toneParaDisponibilidad(pct);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {pct === null ? "Sin datos" : `${pct.toFixed(1)}%`}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${label}: ${pct === null ? "sin datos" : `${pct.toFixed(1)}%`}`}>
        {pct !== null && (
          <div
            className={cn("h-full rounded-full transition-[width]", METER_FILL_CLASS[resolvedTone])}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        )}
      </div>
    </div>
  );
}
