import { useSearchParams } from "react-router-dom";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { NodeList } from "./NodeList.js";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { AlertsPanel } from "./AlertsPanel.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";

export function NetworkView() {
  const [params, setParams] = useSearchParams();
  const sitio = params.get("sitio") ?? undefined;
  const severidad = params.get("severidad");
  const nodeId = params.get("nodeId") ?? undefined;

  const { data: status, isLoading, isError, error, refetch } = useNetworkStatus(sitio);

  if (isLoading) return <LoadingState label="Cargando estado de red…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!status) return null;

  const alertasFiltradas = severidad ? status.alertasRecientes.filter((a) => a.severidad === severidad) : status.alertasRecientes;

  function selectNode(id: string) {
    const next = new URLSearchParams(params);
    next.set("nodeId", id);
    setParams(next, { replace: true });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Nodos ({status.totalNodos})</CardTitle>
          </CardHeader>
          <CardContent>
            {status.nodos.length === 0 ? (
              <EmptyState title="Sin nodos todavía" description="Todavía no hay APs registrados para este sitio." />
            ) : (
              <NodeList nodos={status.nodos} selectedId={nodeId} onSelect={selectNode} />
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
      </div>

      <NodeDetailPanel nodeId={nodeId} />
    </div>
  );
}
