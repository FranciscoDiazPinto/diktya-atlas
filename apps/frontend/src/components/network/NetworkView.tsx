import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { NodeList } from "./NodeList.js";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { AlertsPanel } from "./AlertsPanel.js";
import { ActivityDigestPanel } from "./ActivityDigestPanel.js";
import { VlansPanel } from "./VlansPanel.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";
import { Badge } from "../ui/Badge.js";
import { timeAgo } from "../../lib/timeAgo.js";

/** Umbral para marcar el dato como "posiblemente desactualizado" — worker-monitor
 * sincroniza cada ~30s cuando está corriendo, así que 2 min sin cambios en ningún
 * nodo es una señal real de sync parado, no un valor decorativo. */
const FRESCURA_STALE_SEGUNDOS = 120;

export function NetworkView() {
  const [params, setParams] = useSearchParams();
  const sitio = params.get("sitio") ?? undefined;
  const severidad = params.get("severidad");
  const nodeId = params.get("nodeId") ?? undefined;
  const [busqueda, setBusqueda] = useState("");

  const { data: status, isLoading, isError, error, refetch } = useNetworkStatus(sitio);

  if (isLoading) return <LoadingState label="Cargando estado de red…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!status) return null;

  const alertasFiltradas = severidad ? status.alertasRecientes.filter((a) => a.severidad === severidad) : status.alertasRecientes;
  // Filtro client-side por nombre: la lista completa ya viene en la respuesta,
  // no hace falta ir al backend para esto — pensado para cuando haya 50+ nodos.
  const nodosFiltrados = busqueda.trim()
    ? status.nodos.filter((n) => n.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : status.nodos;

  const ultimaActualizacion = status.nodos.reduce<Date | null>((max, n) => {
    const updatedAt = new Date(n.updatedAt);
    return !max || updatedAt > max ? updatedAt : max;
  }, null);
  const frescuraStale =
    ultimaActualizacion !== null &&
    (Date.now() - ultimaActualizacion.getTime()) / 1000 > FRESCURA_STALE_SEGUNDOS;

  function selectNode(id: string) {
    const next = new URLSearchParams(params);
    next.set("nodeId", id);
    setParams(next, { replace: true });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Nodos ({status.totalNodos})</CardTitle>
            {ultimaActualizacion && (
              <Badge variant={frescuraStale ? "warning" : "neutral"}>
                sincronizado {timeAgo(ultimaActualizacion)}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {status.nodos.length === 0 ? (
              <EmptyState title="Sin nodos todavía" description="Todavía no hay APs registrados para este sitio." />
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar nodo por nombre…"
                    className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                {nodosFiltrados.length === 0 ? (
                  <EmptyState title="Sin resultados" description={`Ningún nodo coincide con "${busqueda}".`} />
                ) : (
                  <NodeList nodos={nodosFiltrados} selectedId={nodeId} onSelect={selectNode} />
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas{severidad ? ` (${severidad})` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsPanel alertas={alertasFiltradas} />
          </CardContent>
        </Card>

        <VlansPanel sitio={sitio} />

        <ActivityDigestPanel />
      </div>

      <NodeDetailPanel nodeId={nodeId} />
    </div>
  );
}
