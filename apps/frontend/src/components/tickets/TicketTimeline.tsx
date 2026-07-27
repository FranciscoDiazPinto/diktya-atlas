import { CheckCircle2, Bell, Wrench, ArrowUpCircle, RotateCcw, CircleDot, type LucideIcon } from "lucide-react";
import type { ApiTicketEvent, ApiTicketEventType } from "../../types/api.js";

const EVENT_CONFIG: Record<ApiTicketEventType, { label: string; Icon: LucideIcon }> = {
  CREADO: { label: "Creado", Icon: CircleDot },
  NOTIFICADO: { label: "Notificado", Icon: Bell },
  REMEDIACION_INTENTADA: { label: "Remediación intentada", Icon: Wrench },
  ESCALADO: { label: "Escalado", Icon: ArrowUpCircle },
  RESUELTO: { label: "Resuelto", Icon: CheckCircle2 },
  REABIERTO: { label: "Reabierto", Icon: RotateCcw },
};

export function TicketTimeline({ eventos }: { eventos: ApiTicketEvent[] }) {
  if (eventos.length === 0) return <p className="text-xs text-slate-400">Sin eventos todavía.</p>;

  return (
    <ol className="flex flex-col gap-3">
      {eventos.map((evento) => {
        const { label, Icon } = EVENT_CONFIG[evento.tipo];
        return (
          <li key={evento.id} className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{evento.detalle}</p>
              <p className="text-xs text-slate-400">{new Date(evento.createdAt).toLocaleString("es-CL")}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
