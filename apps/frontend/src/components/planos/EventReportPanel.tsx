import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import type { ApModel } from "@diktya-atlas/shared";
import { useEventReport } from "../../hooks/useEventDeployments.js";
import { Button } from "../ui/Button.js";
import { Badge } from "../ui/Badge.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";

const AP_MODEL_LABEL: Record<ApModel, string> = {
  U6_MESH: "U6 Mesh (AP)",
  U7_CAMPUS: "U7 Campus (AP)",
  PRO_MAX_24: "Pro Max 24 (switch)",
  FLEX_MINI: "Flex Mini (switch)",
  FLEX: "Flex (switch)",
  FLEX_ULTRA: "Flex Ultra (switch)",
};

export function EventReportPanel({ eventId }: { eventId: string }) {
  const [requested, setRequested] = useState(false);
  const { data, isLoading, isError, error, refetch } = useEventReport(eventId);

  function handleGenerate() {
    setRequested(true);
    void refetch();
  }

  if (!requested) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Resumen del evento: cobertura desplegada (zonas/APs) e incidentes asociados.
          </p>
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            <FileText className="h-3.5 w-3.5" /> Generar reporte
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <LoadingState label="Generando reporte…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Reporte — {data.evento.nombre}</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(data.evento.fechaInicio).toLocaleDateString("es-CL")} –{" "}
            {new Date(data.evento.fechaFin).toLocaleDateString("es-CL")} · {data.evento.estado}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Tickets</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="neutral">{data.tickets.total} total</Badge>
            {data.tickets.porSeveridad.CRITICO > 0 && (
              <Badge variant="danger">{data.tickets.porSeveridad.CRITICO} crítico</Badge>
            )}
            {data.tickets.porSeveridad.ADVERTENCIA > 0 && (
              <Badge variant="warning">{data.tickets.porSeveridad.ADVERTENCIA} advertencia</Badge>
            )}
            <Badge variant="success">{data.tickets.porEstado.RESUELTO} resuelto{data.tickets.porEstado.RESUELTO === 1 ? "" : "s"}</Badge>
            {data.tickets.porEstado.ABIERTO > 0 && <Badge variant="info">{data.tickets.porEstado.ABIERTO} abierto</Badge>}
            {data.tickets.tiempoResolucionPromedioMin !== null && (
              <span className="text-slate-500 dark:text-slate-400">
                · resolución promedio: {data.tickets.tiempoResolucionPromedioMin} min
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Cobertura desplegada ({data.zonas.length} zona{data.zonas.length === 1 ? "" : "s"})
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zona</TableHead>
                <TableHead>Recinto</TableHead>
                <TableHead>Calibrada</TableHead>
                <TableHead>Equipos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.zonas.map((zona) => (
                <TableRow key={zona.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{zona.nombreZona}</TableCell>
                  <TableCell>{zona.venue}</TableCell>
                  <TableCell>
                    <Badge variant={zona.calibrada ? "success" : "warning"}>{zona.calibrada ? "Sí" : "No"}</Badge>
                  </TableCell>
                  <TableCell>
                    {zona.totalAps === 0
                      ? "—"
                      : Object.entries(zona.apsPorModelo)
                          .map(([modelo, cantidad]) => `${cantidad}× ${AP_MODEL_LABEL[modelo as ApModel]}`)
                          .join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
