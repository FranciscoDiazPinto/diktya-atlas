import { Link } from "react-router-dom";
import { SeverityBadge } from "../common/SeverityBadge.js";
import { EmptyState } from "../common/EmptyState.js";
import type { ApiAlert } from "../../types/api.js";

export function AlertsPanel({ alertas }: { alertas: ApiAlert[] }) {
  if (alertas.length === 0) {
    return <EmptyState title="Sin alertas activas" description="No hay alertas recientes para este filtro." />;
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {alertas.map((alert) => (
        <li key={alert.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="flex flex-col">
            <span className="text-slate-800 dark:text-slate-200">{alert.mensaje}</span>
            <span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("es-CL")}</span>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severidad={alert.severidad} />
            {alert.ticketId ? (
              <Link
                to={`/tickets/${alert.ticketId}`}
                className="text-xs text-brand-cyan-hover underline dark:text-brand-cyan"
              >
                Ver ticket
              </Link>
            ) : (
              <span className="text-xs text-slate-400">Sin ticket</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
