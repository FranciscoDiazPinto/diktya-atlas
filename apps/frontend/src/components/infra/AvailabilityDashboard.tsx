import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { useAvailability } from "../../hooks/useAvailability.js";
import { type RangoPreset, RANGO_PRESETS, rangoFor } from "../../lib/dateRanges.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";
import { Button } from "../ui/Button.js";
import { StatTile } from "../ui/StatTile.js";
import { Meter, toneParaDisponibilidad } from "../ui/Meter.js";
import { StatusDot } from "../ui/StatusDot.js";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { ConnectionHistoryChart } from "./ConnectionHistoryChart.js";
import { OutageHistogramChart } from "./OutageHistogramChart.js";

/**
 * Solo Admin (ver requireRole("ADMIN") en /reports/availability) — panel
 * "administrativo" separado de las cards operativas de arriba, que son
 * estado en vivo. Este es histórico: disponibilidad real por rango,
 * a partir de NodeStatusEvent (evento por cambio, no por poll).
 */
export function AvailabilityDashboard() {
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const { desde, hasta } = useMemo(() => rangoFor(preset), [preset]);
  const { data, isLoading, isError, error, refetch } = useAvailability(desde, hasta);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Disponibilidad</CardTitle>
          <div className="flex gap-1">
            {RANGO_PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={preset === p.id ? "default" : "outline"}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoading && <LoadingState label="Calculando disponibilidad…" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Meter label="Disponibilidad promedio" pct={data.disponibilidadPromedio} />
              <StatTile
                label="Cortes en el rango"
                value={data.totalOutages}
                tone={data.totalOutages > 0 ? "warning" : "good"}
                icon={<Activity className="h-4 w-4" />}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Historial de conexión
              </p>
              {data.serieTemporal.every((p) => p.porcentajeOnline === null) ? (
                <EmptyState title="Sin datos" description="Todavía no hay eventos de estado registrados en este rango." />
              ) : (
                <ConnectionHistoryChart data={data.serieTemporal} />
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Duración de los cortes
              </p>
              {data.totalOutages === 0 ? (
                <EmptyState title="Sin cortes" description="Ningún nodo estuvo offline en este rango." />
              ) : (
                <OutageHistogramChart buckets={data.histogramaOutages} />
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Por nodo
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nodo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Disponibilidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porNodo.map((n) => (
                    <TableRow key={n.nodeId}>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{n.nombre}</TableCell>
                      <TableCell>{n.tipoDispositivo}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 tabular-nums">
                          <StatusDot tone={toneParaDisponibilidad(n.disponibilidadPct)} />
                          {n.disponibilidadPct === null ? "Sin datos" : `${n.disponibilidadPct.toFixed(1)}%`}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
