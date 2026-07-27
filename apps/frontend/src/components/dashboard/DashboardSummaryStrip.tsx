import { Wifi, WifiOff, RefreshCw, AlertTriangle, AlertCircle, Ticket as TicketIcon } from "lucide-react";
import { StatTile } from "../ui/StatTile.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useTickets } from "../../hooks/useTickets.js";

/**
 * Snapshot puntual (nodos online/offline/adoptando, alertas por
 * severidad, tickets abiertos) — no una serie de tiempo inventada. Por
 * eso son stat tiles (icono+etiqueta+valor), no un chart: para 6 números
 * puntuales un chart no aporta nada que un vistazo a las tiles no dé
 * (ver dataviz/references/choosing-a-form.md, paso 1: "a veces la
 * respuesta no es un chart"). Clickeables -> saltan a Red/Tickets con el
 * filtro correspondiente ya aplicado.
 */
export function DashboardSummaryStrip() {
  const { data: status, isLoading } = useNetworkStatus();
  const { data: tickets } = useTickets({});

  const ticketsAbiertos = tickets?.filter((t) => t.estado !== "RESUELTO").length ?? 0;

  if (isLoading || !status) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="APs online" value={status.online} tone="good" icon={<Wifi className="h-4 w-4" />} to="/red" />
      <StatTile
        label="APs offline"
        value={status.offline}
        tone="critical"
        icon={<WifiOff className="h-4 w-4" />}
        to="/red"
      />
      <StatTile
        label="Adoptando"
        value={status.adoptando}
        tone="warning"
        icon={<RefreshCw className="h-4 w-4" />}
        to="/red"
      />
      <StatTile
        label="Alertas críticas"
        value={status.alertasPorSeveridad.CRITICO}
        tone="critical"
        icon={<AlertTriangle className="h-4 w-4" />}
        to="/red?severidad=CRITICO"
      />
      <StatTile
        label="Alertas advertencia"
        value={status.alertasPorSeveridad.ADVERTENCIA}
        tone="warning"
        icon={<AlertCircle className="h-4 w-4" />}
        to="/red?severidad=ADVERTENCIA"
      />
      <StatTile
        label="Tickets abiertos"
        value={ticketsAbiertos}
        tone="serious"
        icon={<TicketIcon className="h-4 w-4" />}
        to="/tickets?estado=ABIERTO"
      />
    </div>
  );
}
