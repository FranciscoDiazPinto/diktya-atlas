import { RefreshCw, Router } from "lucide-react";
import { useMobilityStatus } from "../../hooks/useMobilityStatus.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.js";
import { Button } from "../ui/Button.js";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import { EmptyState } from "../common/EmptyState.js";
import type { ApiMobilityDeviceState } from "../../types/api.js";

function deviceTone(state: ApiMobilityDeviceState): StatusTone {
  if (state === "CONNECTED") return "good";
  if (state === "DISCONNECTED" || state === "FACTORY_RESET" || state === "DELETING") return "critical";
  if (state === "NULL") return "muted";
  return "warning"; // ADOPTING*, DOWNLOADING, UPGRADING, RESTARTING, GETTING_READY, RESTORING: transición
}

/**
 * UMR (routers móviles/de viaje) vía la API cloud de UniFi Mobility —
 * separada de OPNsense/UniFi OS (otro proveedor/host), mismo criterio de
 * "consultar bajo demanda" que UnifiOsRealCard: es tráfico real a un
 * servicio externo, no algo para poll automático cada 30s.
 */
export function MobilityCard() {
  const { data, isLoading, isError, error, refetch, isFetched } = useMobilityStatus();
  const totalDevices = data?.workspaces.reduce((acc, w) => acc + w.devices.length, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>UniFi Mobility</CardTitle>
          <CardDescription>Routers móviles/de viaje (UMR) — solo lectura, vía api.ui.com</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {isFetched ? "Actualizar" : "Consultar ahora"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && (
          <p className="text-sm text-status-critical">No se pudo consultar: {(error as Error).message}</p>
        )}
        {!isFetched && !isLoading && !isError && (
          <EmptyState
            title="Sin consultar todavía"
            description="No se actualiza solo — apretá 'Consultar ahora'. Requiere UNIFI_MOBILITY_API_KEY configurada en el backend."
          />
        )}
        {data && data.workspaces.length === 0 && (
          <EmptyState title="Sin workspaces" description="La API key no tiene acceso a ningún workspace de Mobility." />
        )}
        {data && data.workspaces.length > 0 && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data.workspaces.length} workspace{data.workspaces.length !== 1 ? "s" : ""} · {totalDevices} device
              {totalDevices !== 1 ? "s" : ""}
            </p>
            {data.workspaces.map(({ workspace, devices }) => (
              <div key={workspace.workspace_id}>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {workspace.workspace_name}
                </p>
                {devices.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin devices en este workspace.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {devices.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <Router className="h-4 w-4 text-slate-400" aria-hidden />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
                          <span className="text-xs text-slate-400">{d.model}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusDot tone={deviceTone(d.state)} />
                          <span className="text-xs text-slate-500 dark:text-slate-400">{d.state}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
