import { useMemo, useState } from "react";
import { AlertCircle, Ticket as TicketIcon, Clock, Network, ShieldCheck } from "lucide-react";
import { useActivityDigest } from "../../hooks/useActivityDigest.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";
import { Button } from "../ui/Button.js";
import { StatTile } from "../ui/StatTile.js";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import type { StatusTone } from "../ui/StatusDot.js";

type RangoPreset = "hoy" | "ayer" | "7dias";

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function rangoFor(preset: RangoPreset): { desde: string; hasta: string } {
  const ahora = new Date();
  if (preset === "hoy") return { desde: startOfDay(ahora).toISOString(), hasta: ahora.toISOString() };
  if (preset === "ayer") {
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    return { desde: startOfDay(ayer).toISOString(), hasta: endOfDay(ayer).toISOString() };
  }
  const hace7 = new Date(ahora);
  hace7.setDate(hace7.getDate() - 7);
  return { desde: startOfDay(hace7).toISOString(), hasta: ahora.toISOString() };
}

function formatMinutos(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** Peor severidad presente en un conteo por severidad — define el tono del stat tile. */
function toneParaSeveridad(porSeveridad: Record<"INFO" | "ADVERTENCIA" | "CRITICO", number>): StatusTone {
  if (porSeveridad.CRITICO > 0) return "critical";
  if (porSeveridad.ADVERTENCIA > 0) return "warning";
  return "good";
}

const PRESETS: Array<{ id: RangoPreset; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7dias", label: "Últimos 7 días" },
];

/**
 * Solo point-in-time / conteos agregados de un rango — no hay serie
 * temporal real que graficar (ver dataviz/references/choosing-a-form.md),
 * por eso stat tiles en vez de un chart, mismo criterio que
 * DashboardSummaryStrip. La tabla "por worker" es la única lista abierta
 * (nombres de worker no son un set fijo), por eso queda como tabla en vez
 * de forzarla a tiles.
 */
export function ActivityDigestPanel() {
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  // Memoizado a propósito: `rangoFor` usa `new Date()` para "hasta", así que
  // sin esto cada render generaría un timestamp nuevo -> queryKey nueva ->
  // refetch -> re-render -> loop infinito (confirmado en vivo: tumbó el
  // rate limit en segundos). Solo se recalcula cuando cambia el preset.
  const { desde, hasta } = useMemo(() => rangoFor(preset), [preset]);
  const { data: digest, isLoading, isError, error, refetch } = useActivityDigest(desde, hasta);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Actividad</CardTitle>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
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
      <CardContent className="flex flex-col gap-4">
        {isLoading && <LoadingState label="Cargando actividad…" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {digest && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile
                label="Alertas"
                value={digest.alertas.total}
                tone={toneParaSeveridad(digest.alertas.porSeveridad)}
                icon={<AlertCircle className="h-4 w-4" />}
              />
              <StatTile
                label="Tickets"
                value={digest.tickets.total}
                tone={toneParaSeveridad(digest.tickets.porSeveridad)}
                icon={<TicketIcon className="h-4 w-4" />}
              />
              <StatTile
                label="Resolución promedio"
                value={formatMinutos(digest.tickets.tiempoResolucionPromedioMin)}
                tone="muted"
                icon={<Clock className="h-4 w-4" />}
              />
              <StatTile
                label="Reservas VLAN"
                value={digest.vlan.total}
                tone="muted"
                icon={<Network className="h-4 w-4" />}
              />
              <StatTile
                label="Auditoría fallida"
                value={digest.auditoria.fallidos}
                tone={digest.auditoria.fallidos > 0 ? "serious" : "good"}
                icon={<ShieldCheck className="h-4 w-4" />}
              />
            </div>

            {digest.auditoria.total > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Auditoría por worker
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Éxito</TableHead>
                      <TableHead>Fallo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(digest.auditoria.porWorker).map(([worker, stats]) => (
                      <TableRow key={worker}>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">{worker}</TableCell>
                        <TableCell>{stats.total}</TableCell>
                        <TableCell>{stats.exitosos}</TableCell>
                        <TableCell className={stats.fallidos > 0 ? "text-status-serious" : undefined}>
                          {stats.fallidos}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
