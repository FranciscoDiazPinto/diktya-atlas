import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export interface ExpandableCardProps {
  /** Siempre visible: resumen chico (ej. un total) + el chevron a la derecha. */
  collapsed: ReactNode;
  /** Solo visible al expandir (hover / foco de teclado). */
  expanded: ReactNode;
  className?: string;
}

/**
 * Card colapsada por defecto que se expande con hover — y con foco de
 * teclado (`group-focus`, así queda accesible sin mouse) — usando el truco
 * de grid-template-rows 0fr->1fr para animar a alto "auto" sin JS (a
 * diferencia de max-height, que necesita un tope arbitrario que puede
 * cortar contenido más largo de lo previsto).
 *
 * Pensado para tiles del dashboard que arrancan como un resumen chico pero
 * pueden necesitar mostrar más detalle sin ocupar espacio permanente (ver
 * NodesByTypeCard, el primer caso de uso).
 */
export function ExpandableCard({ collapsed, expanded, className }: ExpandableCardProps) {
  return (
    <div
      tabIndex={0}
      className={cn(
        "group rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-900",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {collapsed}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:rotate-180 group-focus:rotate-180"
          aria-hidden
        />
      </div>
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">{expanded}</div>
        </div>
      </div>
    </div>
  );
}
