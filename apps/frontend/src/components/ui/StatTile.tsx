import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import type { StatusTone } from "./StatusDot.js";

const TONE_ICON_CLASS: Record<StatusTone, string> = {
  good: "text-status-good",
  warning: "text-status-warning",
  serious: "text-status-serious",
  critical: "text-status-critical",
  muted: "text-slate-500 dark:text-slate-400",
};

export interface StatTileProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone: StatusTone;
  to?: string;
}

/**
 * Value/label en tinta neutra siempre (nunca el color del status) — el
 * ícono con su círculo es lo único que lleva el tono, y siempre va
 * acompañado de la etiqueta de texto: nunca color solo.
 */
export function StatTile({ label, value, icon, tone, to }: StatTileProps) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800",
          TONE_ICON_CLASS[tone]
        )}
      >
        {icon}
      </span>
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );

  if (!to) return content;
  return (
    <Link to={to} className="block rounded-lg transition hover:-translate-y-0.5 hover:shadow-md">
      {content}
    </Link>
  );
}
