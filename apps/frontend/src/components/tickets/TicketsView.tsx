import { useSearchParams } from "react-router-dom";
import { useTickets } from "../../hooks/useTickets.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "../ui/Table.js";
import { TicketRow } from "./TicketRow.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";

const ESTADOS = ["ABIERTO", "EN_PROGRESO", "ESCALADO", "RESUELTO"];
const SEVERIDADES = ["INFO", "ADVERTENCIA", "CRITICO"];
const ALL = "__all";

export function TicketsView() {
  const [params, setParams] = useSearchParams();
  const estado = params.get("estado") ?? undefined;
  const severidad = params.get("severidad") ?? undefined;

  const { data: tickets, isLoading, isError, error, refetch } = useTickets({ estado, severidad });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Tickets</CardTitle>
          <div className="flex gap-2">
            <Select value={estado ?? ALL} onValueChange={(v) => setFilter("estado", v)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los estados</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severidad ?? ALL} onValueChange={(v) => setFilter("severidad", v)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas las severidades</SelectItem>
                {SEVERIDADES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Cargando tickets…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !tickets || tickets.length === 0 ? (
          <EmptyState title="Sin tickets" description="No hay tickets para este filtro." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Asignado a</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
