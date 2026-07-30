import { RefreshCw, Power } from "lucide-react";
import { useNodeDetail } from "../../hooks/useNodeDetail.js";
import { useDiagnoseNode } from "../../hooks/useDiagnoseNode.js";
import { useRebootNode } from "../../hooks/useRebootNode.js";
import { useRealtime } from "../../hooks/RealtimeProvider.js";
import { useAuth } from "../../auth/AuthContext.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { SeverityBadge } from "../common/SeverityBadge.js";
import { NodeStatusBadge } from "./NodeStatusBadge.js";
import { Button } from "../ui/Button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.js";

function formatUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function timeAgo(date: Date | null): string {
  if (!date) return "sin eventos todavía";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  return `hace ${Math.floor(minutes / 60)}h`;
}

export function NodeDetailPanel({ nodeId }: { nodeId?: string }) {
  const { data: node, isLoading, isError, error, refetch } = useNodeDetail(nodeId);
  const { lastEventAt } = useRealtime();
  const { user } = useAuth();
  const canDiagnose = user?.role === "ADMIN" || user?.role === "TECNICO";
  const diagnose = useDiagnoseNode();
  const reboot = useRebootNode();

  function handleReboot(id: string, nombre: string) {
    if (confirm(`¿Reiniciar "${nombre}"? Esto va a desconectar momentáneamente a todos los clientes conectados a este AP.`)) {
      reboot.mutate(id);
    }
  }

  if (!nodeId) {
    return <EmptyState title="Elegí un nodo" description="Seleccioná un AP de la lista para ver su detalle." />;
  }
  if (isLoading) return <LoadingState label="Cargando nodo…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!node) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{node.nombre}</CardTitle>
          <div className="flex items-center gap-2">
            {canDiagnose && (
              <>
                <Button size="sm" variant="outline" onClick={() => diagnose.mutate(node.id)} disabled={diagnose.isPending}>
                  <RefreshCw className={diagnose.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Actualizar ahora
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReboot(node.id, node.nombre)}
                  disabled={reboot.isPending}
                >
                  <Power className="h-3.5 w-3.5" />
                  Reiniciar AP
                </Button>
              </>
            )}
            <NodeStatusBadge status={node.status} />
          </div>
        </div>
        <CardDescription>
          {node.sitio} · {node.modelo ?? "modelo desconocido"} · actualizado {timeAgo(lastEventAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>Señal: {node.senalDbm !== null ? `${node.senalDbm} dBm` : "—"}</span>
          <span>Clientes: {node.clientesConectados}</span>
          <span>Uptime: {formatUptime(node.uptimeSegundos)}</span>
        </div>
        {diagnose.isError && (
          <p className="text-xs text-status-critical">No se pudo diagnosticar: {(diagnose.error as Error).message}</p>
        )}
        {reboot.isError && (
          <p className="text-xs text-status-critical">No se pudo reiniciar: {(reboot.error as Error).message}</p>
        )}
        {reboot.isSuccess && (
          <p className="text-xs text-status-good">
            Reinicio enviado — puede tardar un rato en volver a reportarse online.
          </p>
        )}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Redes WiFi (SSID)
          </p>
          {node.wifiNetworks.length === 0 ? (
            <p className="text-xs text-slate-400">Sin SSIDs transmitidos.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {node.wifiNetworks.map((w) => (
                <li
                  key={w.id}
                  className="flex justify-between rounded border border-slate-100 px-2 py-1 dark:border-slate-800"
                >
                  <span>{w.ssid}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    VLAN {w.vlanId} · {w.bandas.join("/")} · {w.clientesConectados} clientes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Alertas recientes
          </p>
          {node.alerts.length === 0 ? (
            <p className="text-xs text-slate-400">Sin alertas para este nodo.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {node.alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{a.mensaje}</span>
                  <SeverityBadge severidad={a.severidad} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
