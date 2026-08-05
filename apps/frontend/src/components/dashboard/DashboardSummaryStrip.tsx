import { RefreshCw, AlertTriangle, AlertCircle, Ticket as TicketIcon } from "lucide-react";
import { StatTile } from "../ui/StatTile.js";
import { NodesByTypeCard } from "./NodesByTypeCard.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useTickets } from "../../hooks/useTickets.js";

/**
 * Snapshot puntual (nodos por tipo, adoptando, alertas por severidad,
 * tickets abiertos) — no una serie de tiempo inventada. Por eso son stat
 * tiles (icono+etiqueta+valor), no un chart (ver dataviz/references/
 * choosing-a-form.md, paso 1: "a veces la respuesta no es un chart").
 * El desglose de nodos va por `tipoDispositivo` real (NodesByTypeCard) —
 * antes "APs online/offline" contaba todos los nodos sin filtrar por tipo
 * (switches/UPS/gateways se mostraban como si fueran AP). Los StatTile
 * son clickeables -> saltan a Red/Tickets con el filtro ya aplicado.
 */
export function DashboardSummaryStrip() {
  const { data: status, isLoading } = useNetworkStatus();
  const { data: tickets } = useTickets({});

  const ticketsAbiertos = tickets?.filter((t) => t.estado !== "RESUELTO").length ?? 0;

  if (isLoading || !status) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="col-span-2 sm:col-span-3 lg:col-span-2">
        <NodesByTypeCard nodos={status.nodos} />
      </div>
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
