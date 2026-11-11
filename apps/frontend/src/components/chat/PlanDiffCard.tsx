import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VlanPlan } from "@diktya-atlas/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/Card.js";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/Dialog.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useApiClient } from "../../hooks/useApiClient.js";
import { useReserveVlan } from "../../hooks/useReserveVlan.js";
import { useApplyVlan } from "../../hooks/useApplyVlan.js";
import type { ChangeExecutionStatus, VlanPlanDetail, VlanReserveItemResult } from "../../types/api.js";

const ACTION = { crear: "Crear", modificar: "Modificar", sin_cambios: "Sin cambios" };
const STATUS: Record<ChangeExecutionStatus, string> = {
  APPROVED: "Aprobado · encolado pendiente", QUEUED: "En cola", EXECUTING: "Ejecutando", APPLIED: "Aplicado y verificado",
  BLOCKED: "Bloqueado · revisar plan", FAILED: "Falló · cambios revertidos", UNCERTAIN: "Resultado incierto · revisión técnica",
};
export function PlanDiffCard({ plan, onDismiss }: { plan: VlanPlan; onDismiss: () => void }) {
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "TECNICO";
  const api = useApiClient();
  const cache = useQueryClient();
  const reserve = useReserveVlan();
  const apply = useApplyVlan();
  const [results, setResults] = useState<VlanReserveItemResult[]>([]);
  const [selected, setSelected] = useState<{ reservationId: string; index: number } | null>(null);
  const detail = useQuery({ queryKey: ["vlan-plan", plan.id], queryFn: () => api.get<VlanPlanDetail>(`/vlan/plans/${plan.id}`), enabled: canWrite,
    refetchInterval: (query) => query.state.data?.reservations.some((row) => ["APPROVED", "QUEUED", "EXECUTING"].includes(row.executionStatus ?? "")) ? 2000 : false,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, new Date(plan.expiresAt).getTime() - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [plan.expiresAt]);
  const expired = new Date(plan.expiresAt).getTime() <= now;
  const changed = detail.data && detail.data.plan.fingerprint !== plan.fingerprint;
  const disabled = expired || Boolean(changed) || detail.isError || detail.isPending;
  const refresh = () => { void cache.invalidateQueries({ queryKey: ["vlan-plan", plan.id] }); void cache.invalidateQueries({ queryKey: ["vlan-plans"] }); };
  const release = useMutation({ mutationFn: (reservationId: string) => api.post("/vlan/release", { reservationId, version: plan.version, fingerprint: plan.fingerprint }), onSuccess: refresh });
  const selectedItem = selected ? plan.items[selected.index] : null;
  const selectedReservation = detail.data?.reservations.find((row) => row.id === selected?.reservationId);
  const approvalExpired = selectedReservation?.approvalExpiresAt ? new Date(selectedReservation.approvalExpiresAt).getTime() <= Date.now() : false;
  return <Card>
    <CardHeader>
      <CardTitle>Plan de cambios de VLAN</CardTitle>
      <CardDescription>{plan.items.filter((item) => item.accion !== "sin_cambios").length} cambios propuestos. Cada escritura requiere aprobación explícita.</CardDescription>
      <p className="text-xs">{plan.source === "mock" ? "Simulación · no modifica equipos reales" : "Infraestructura real"}</p>
      <p className="text-xs">Vigente hasta {new Date(plan.expiresAt).toLocaleString()}</p>
    </CardHeader>
    <CardContent>
      {expired && <p role="alert">El plan venció. Genera una nueva propuesta.</p>}
      {changed && <p role="alert">La propuesta cambió. Recarga y revisa el plan.</p>}
      {detail.error && <p role="alert">{detail.error.message}</p>}
      {reserve.error && <p role="alert">{reserve.error.message}</p>}
      {apply.error && <p role="alert">{apply.error.message}</p>}
      {release.error && <p role="alert">{release.error.message}</p>}
      <Table><TableHeader><TableRow><TableHead>Sitio</TableHead><TableHead>Red actual</TableHead><TableHead>Red propuesta</TableHead><TableHead>Acción</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
        <TableBody>{plan.items.map((item, index) => {
          const reservation = detail.data?.reservations.find((row) => row.sitio === item.sitio && row.redSolicitada === item.redPropuesta.ssid);
          const failure = results.find((row) => row.sitio === item.sitio && row.ssid === item.redPropuesta.ssid && !row.ok);
          const status = reservation?.executionStatus;
          const canApprove = reservation?.estado === "RESERVADA" && (!status || status === "APPROVED");
          return <TableRow key={`${item.sitio}-${item.redPropuesta.ssid}`}>
            <TableCell>{item.sitio}</TableCell>
            <TableCell>{item.redActual ? `${item.redActual.ssid} (VLAN ${item.redActual.vlanId})` : "—"}</TableCell>
            <TableCell>{item.redPropuesta.ssid} (VLAN {item.redPropuesta.vlanId}, {item.redPropuesta.banda})</TableCell>
            <TableCell><Badge variant="neutral">{ACTION[item.accion]}</Badge></TableCell>
            <TableCell>
              {reservation?.estado === "LIBERADA" && <span className="text-xs">Reserva liberada</span>}
              {status && reservation?.estado !== "LIBERADA" && <Badge variant={status === "APPLIED" ? "success" : ["FAILED", "BLOCKED", "UNCERTAIN"].includes(status) ? "danger" : "info"}>{STATUS[status]}</Badge>}
              {canWrite && canApprove && <Button size="sm" disabled={disabled || apply.isPending || release.isPending} onClick={() => setSelected({ reservationId: reservation.id, index })}>{status === "APPROVED" ? "Reintentar encolado" : "Revisar y aprobar"}</Button>}
              {canWrite && reservation?.estado === "RESERVADA" && (!status || ["APPROVED", "QUEUED", "BLOCKED", "FAILED"].includes(status)) &&
                <Button size="sm" variant="outline" disabled={release.isPending || apply.isPending} onClick={() => release.mutate(reservation.id)}>Liberar reserva</Button>}
              {!status && reservation && <span className="text-xs">{reservation.estado === "LIBERADA" ? "Liberada" : "Reservado · sin aprobación"}</span>}
              {failure && <p role="alert" className="text-xs">{failure.error}</p>}
            </TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </CardContent>
    <CardFooter>
      {canWrite ? <Button size="sm" disabled={disabled || reserve.isPending || apply.isPending || !plan.items.some((item) => item.accion !== "sin_cambios")}
        onClick={() => reserve.mutate(plan, { onSuccess: (data) => { setResults(data.results); refresh(); } })}>Reservar cambios</Button>
        : <p className="text-xs">Tu rol no puede reservar ni aplicar cambios de red.</p>}
      <Button size="sm" variant="outline" onClick={onDismiss}>Cerrar plan</Button>
    </CardFooter>
    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open && !apply.isPending) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Confirmar cambio de red</DialogTitle>
        <DialogDescription>Autorizarás únicamente esta fila del plan revisado. Puede afectar la conectividad de sus usuarios.</DialogDescription></DialogHeader>
        {selectedItem && <div className="space-y-2 text-sm">
          <p>Sitio: {selectedItem.sitio}</p><p>SSID: {selectedItem.redPropuesta.ssid}</p>
          <p>VLAN: {selectedItem.redActual?.vlanId ?? "Sin red existente"} → {selectedItem.redPropuesta.vlanId}</p>
          <p>Banda: {selectedItem.redPropuesta.banda}</p>
          <p>La aprobación vence a los 10 minutos o al vencer el plan, lo que ocurra primero.</p>
        </div>}
        {approvalExpired && <p role="alert">La aprobación venció. Genera otro plan.</p>}
        {apply.error && <p role="alert">{apply.error.message}</p>}
        <DialogFooter><Button variant="outline" disabled={apply.isPending} onClick={() => setSelected(null)}>Cancelar</Button>
          <Button disabled={disabled || approvalExpired || apply.isPending || !selected} onClick={() => {
            if (!selected) return;
            apply.mutate({ reservationId: selected.reservationId, version: plan.version, fingerprint: plan.fingerprint, confirm: true }, {
              onSuccess: () => { setSelected(null); refresh(); }, onError: refresh,
            });
          }}>Confirmar y encolar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
