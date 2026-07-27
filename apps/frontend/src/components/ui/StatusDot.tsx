import { cn } from "../../lib/cn.js";

/**
 * Colores de status fijos de la skill dataviz (references/palette.md) —
 * nunca se usan solos: siempre acompañados de ícono + etiqueta en el
 * componente que los usa (StatTile, NodeStatusBadge, SeverityBadge).
 */
const STATUS_DOT_CLASS = {
  good: "bg-status-good",
  warning: "bg-status-warning",
  serious: "bg-status-serious",
  critical: "bg-status-critical",
  muted: "bg-slate-400 dark:bg-slate-600",
} as const;

export type StatusTone = keyof typeof STATUS_DOT_CLASS;

export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS[tone], className)} />;
}
