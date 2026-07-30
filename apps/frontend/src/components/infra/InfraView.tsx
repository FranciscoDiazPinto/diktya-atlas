import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldOff, RefreshCw } from "lucide-react";
import { useOpnsenseStatus } from "../../hooks/useOpnsenseStatus.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useUnifiOsStatus } from "../../hooks/useUnifiOsStatus.js";
import { useCreateTicket } from "../../hooks/useCreateTicket.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { SeverityBadge } from "../common/SeverityBadge.js";
import { StatusDot, type StatusTone } from "../ui/StatusDot.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.js";
import type { ApiAlertSeverity } from "../../types/api.js";

function nodeTone(status: string): StatusTone {
  if (status === "online" || status === "ONLINE") return "good";
  if (status === "offline" || status === "OFFLINE") return "critical";
  if (status === "adopting" || status === "ADOPTING") return "warning";
  return "muted";
}

function OpnsenseCard() {
  const { data, isLoading, isError, error, refetch } = useOpnsenseStatus();

  if (isLoading) return <LoadingState label="Consultando OPNsense…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>OPNsense</CardTitle>
        <CardDescription>
          {data.online}/{data.totalNodos} nodos online · datos simulados (OPNSENSE_MODE=mock)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {data.nodos.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {n.status === "online" ? (
                  <ShieldCheck className="h-4 w-4 text-status-good" aria-hidden />
                ) : (
                  <ShieldOff className="h-4 w-4 text-status-critical" aria-hidden />
                )}
                <span className="font-medium text-slate-800 dark:text-slate-200">{n.nombre}</span>
                {n.modelo && <span className="text-xs text-slate-400">{n.modelo}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <StatusDot tone={nodeTone(n.status)} />
                <span className="text-xs text-slate-500 dark:text-slate-400">{n.status}</span>
              </div>
            </li>
          ))}
        </ul>

        {data.alertas.length === 0 ? (
          <EmptyState title="Sin alertas" description="No hay alertas activas en OPNsense." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.alertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{a.mensaje}</span>
                <SeverityBadge severidad={a.severidad} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UnifiSummaryCard() {
  const { data, isLoading, isError, error, refetch } = useNetworkStatus();

  if (isLoading) return <LoadingState label="Consultando UniFi…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>UniFi</CardTitle>
        <CardDescription>
          {data.online}/{data.totalNodos} nodos online
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <StatusDot tone="good" /> {data.online} online
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot tone="critical" /> {data.offline} offline
          </span>
          {data.alertasPorSeveridad.CRITICO > 0 && (
            <Badge variant="danger">{data.alertasPorSeveridad.CRITICO} alertas críticas</Badge>
          )}
        </div>
        <Link to="/red" className="text-sm text-brand-cyan-hover underline dark:text-brand-cyan">
          Ver detalle completo de nodos y alertas →
        </Link>
      </CardContent>
    </Card>
  );
}

function UnifiOsRealCard() {
  const { data, isLoading, isError, error, refetch, isFetched } = useUnifiOsStatus();
  const wiredCount = data?.clients.filter((c) => c.type === "WIRED").length ?? 0;
  const wirelessCount = data?.clients.filter((c) => c.type === "WIRELESS").length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>UniFi (real)</CardTitle>
          <CardDescription>
            Solo lectura, hardware real vía API de integraciones — sin señal/alarmas/WLANs (esa API no los expone)
          </CardDescription>
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
            description="No se actualiza solo (para no generarle tráfico de fondo al equipo real) — apretá 'Consultar ahora'."
          />
        )}
        {data && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sitio: {data.site.name} · {data.clients.length} clientes ({wiredCount} cableados, {wirelessCount}{" "}
              WiFi)
            </p>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Dispositivos ({data.devices.length})
              </p>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {data.devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
                      <span className="text-xs text-slate-400">
                        {d.model} · {d.ipAddress}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusDot tone={nodeTone(d.state)} />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{d.state}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RequestChangeForm() {
  const [sistema, setSistema] = useState<"OPNsense" | "UniFi">("OPNsense");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [severidad, setSeveridad] = useState<ApiAlertSeverity>("ADVERTENCIA");
  const createTicket = useCreateTicket();

  function handleSubmit() {
    if (!titulo.trim() || !descripcion.trim()) return;
    createTicket.mutate(
      { titulo: `[${sistema}] ${titulo.trim()}`, descripcion: descripcion.trim(), severidad },
      {
        onSuccess: () => {
          setTitulo("");
          setDescripcion("");
        },
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitar cambio</CardTitle>
        <CardDescription>
          Crea un ticket para pedir una revisión o modificación en OPNsense/UniFi — no se ejecuta nada directo, queda
          para que un técnico lo tome.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Select value={sistema} onValueChange={(v) => setSistema(v as "OPNsense" | "UniFi")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPNsense">OPNsense</SelectItem>
              <SelectItem value="UniFi">UniFi</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severidad} onValueChange={(v) => setSeveridad(v as ApiAlertSeverity)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="ADVERTENCIA">Advertencia</SelectItem>
              <SelectItem value="CRITICO">Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título del cambio solicitado"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Detalle: qué cambiar y por qué"
          rows={3}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <Button
          onClick={handleSubmit}
          disabled={createTicket.isPending || !titulo.trim() || !descripcion.trim()}
          className="self-start"
        >
          Crear solicitud
        </Button>
        {createTicket.isSuccess && <p className="text-sm text-status-good">Ticket creado.</p>}
        {createTicket.isError && (
          <p className="text-sm text-status-critical">No se pudo crear el ticket: {(createTicket.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function InfraView() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <OpnsenseCard />
        <UnifiSummaryCard />
        <UnifiOsRealCard />
      </div>
      <RequestChangeForm />
    </div>
  );
}
