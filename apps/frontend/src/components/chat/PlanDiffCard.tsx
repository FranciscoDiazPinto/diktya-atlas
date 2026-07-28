import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import type { VlanPlan } from "@diktya-atlas/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/Card.js";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/Table.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useReserveVlan } from "../../hooks/useReserveVlan.js";
import { useApplyVlan } from "../../hooks/useApplyVlan.js";
import type { VlanReserveItemResult } from "../../types/api.js";

const ACCION_LABEL: Record<string, string> = { crear: "Crear", modificar: "Modificar", sin_cambios: "Sin cambios" };
const ACCION_VARIANT: Record<string, "success" | "info" | "neutral"> = {
  crear: "success",
  modificar: "info",
  sin_cambios: "neutral",
};

/**
 * Nunca un botón único "aplicar todo": reservar y aplicar son pasos
 * separados y explícitos por fila, con el diff siempre visible.
 */
export function PlanDiffCard({ plan, onDismiss }: { plan: VlanPlan; onDismiss: () => void }) {
  const { user } = useAuth();
  const role = user!.role;
  const canWrite = role === "ADMIN" || role === "TECNICO";
  const reserve = useReserveVlan();
  const apply = useApplyVlan();
  const [results, setResults] = useState<VlanReserveItemResult[] | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const cambios = plan.items.filter((item) => item.accion !== "sin_cambios");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de cambios de VLAN</CardTitle>
        <CardDescription>
          {cambios.length} cambio{cambios.length === 1 ? "" : "s"} propuesto{cambios.length === 1 ? "" : "s"} — no se
          aplicó nada todavía.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sitio</TableHead>
              <TableHead>Red actual</TableHead>
              <TableHead>Red propuesta</TableHead>
              <TableHead>Acción</TableHead>
              {results && <TableHead>Reserva</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.items.map((item, idx) => {
              const result = results?.find((r) => r.sitio === item.sitio && r.ssid === item.redPropuesta.ssid);
              return (
                <TableRow key={idx}>
                  <TableCell>{item.sitio}</TableCell>
                  <TableCell>
                    {item.redActual ? `${item.redActual.ssid} (VLAN ${item.redActual.vlanId})` : "—"}
                  </TableCell>
                  <TableCell>
                    {item.redPropuesta.ssid} (VLAN {item.redPropuesta.vlanId}, {item.redPropuesta.banda})
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACCION_VARIANT[item.accion]}>{ACCION_LABEL[item.accion]}</Badge>
                  </TableCell>
                  {results && (
                    <TableCell>
                      {!result ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : result.ok ? (
                        appliedIds.has(result.reservationId!) ? (
                          <Badge variant="success">Aplicado</Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              apply.mutate(result.reservationId!, {
                                onSuccess: () => setAppliedIds((s) => new Set(s).add(result.reservationId!)),
                              })
                            }
                            disabled={apply.isPending}
                          >
                            Aplicar
                          </Button>
                        )
                      ) : (
                        <Badge variant="danger" title={result.error}>
                          Conflicto (409)
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        {!canWrite ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tu rol ({role}) no puede reservar ni aplicar cambios de red — necesitás rol Técnico o Admin.
          </p>
        ) : !results ? (
          <>
            <Button
              size="sm"
              onClick={() => reserve.mutate(plan.id, { onSuccess: (data) => setResults(data.results) })}
              disabled={reserve.isPending || cambios.length === 0}
            >
              <Check className="h-4 w-4" /> Confirmar (reservar)
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              <X className="h-4 w-4" /> Rechazar
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              <Pencil className="h-4 w-4" /> Editar CSV
            </Button>
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reservado. Aplicá cada fila cuando quieras confirmar la escritura real en la red.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
