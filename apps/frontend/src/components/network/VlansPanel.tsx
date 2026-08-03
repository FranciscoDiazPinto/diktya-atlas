import { Network, RefreshCw } from "lucide-react";
import { useWifiNetworks } from "../../hooks/useWifiNetworks.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../common/EmptyState.js";

export function VlansPanel({ sitio }: { sitio?: string }) {
  const { data: redes, isLoading, isError, error, refetch, isFetched } = useWifiNetworks(sitio);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>VLANs</CardTitle>
          <CardDescription>Consulta en vivo a UniFi (WiFi Broadcasts) — no auto-actualiza.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {isFetched ? "Actualizar" : "Consultar ahora"}
        </Button>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="text-sm text-status-critical">No se pudo consultar: {(error as Error).message}</p>
        )}
        {!isFetched && !isLoading && !isError && (
          <EmptyState
            title="Sin consultar todavía"
            description="No se actualiza solo (tráfico real contra el equipo) — apretá 'Consultar ahora'."
          />
        )}
        {redes && redes.length === 0 && (
          <EmptyState title="Sin VLANs" description="UniFi no reporta ningún SSID para este sitio." />
        )}
        {redes && redes.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {redes.map((red) => (
              <li
                key={red.id}
                className="flex flex-col gap-1 rounded-md border border-slate-100 p-3 text-sm dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                    <Network className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    {red.ssid}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">VLAN {red.vlanId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{red.bandas.join("/")}</span>
                  <span>{red.clientesConectados} clientes</span>
                  <span>{red.throughputMbps !== undefined ? `${red.throughputMbps.toFixed(1)} Mbps` : "sin throughput"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
