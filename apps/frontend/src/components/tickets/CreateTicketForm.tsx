import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "../../auth/AuthContext.js";
import { useEventDeployments } from "../../hooks/useEventDeployments.js";
import { useCreateTicket } from "../../hooks/useCreateTicket.js";
import { Button } from "../ui/Button.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import type { ApiAlertSeverity } from "../../types/api.js";

const SEVERIDADES: ApiAlertSeverity[] = ["INFO", "ADVERTENCIA", "CRITICO"];
const SIN_EVENTO = "__sin_evento";

export function CreateTicketForm() {
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "TECNICO";

  const { data: events } = useEventDeployments();
  const createTicket = useCreateTicket();

  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [severidad, setSeveridad] = useState<ApiAlertSeverity>("ADVERTENCIA");
  const [eventDeploymentId, setEventDeploymentId] = useState(SIN_EVENTO);

  if (!canWrite) return null;

  function handleSubmit() {
    if (!titulo.trim() || !descripcion.trim()) return;
    createTicket.mutate(
      {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        severidad,
        eventDeploymentId: eventDeploymentId === SIN_EVENTO ? undefined : eventDeploymentId,
      },
      {
        onSuccess: () => {
          setTitulo("");
          setDescripcion("");
          setSeveridad("ADVERTENCIA");
          setEventDeploymentId(SIN_EVENTO);
          setShowForm(false);
        },
      }
    );
  }

  if (!showForm) {
    return (
      <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
        <Plus className="h-3.5 w-3.5" /> Nuevo ticket
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <Select value={severidad} onValueChange={(v) => setSeveridad(v as ApiAlertSeverity)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERIDADES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción"
        rows={2}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
      />

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Evento (opcional — para que el ticket entre en su reporte)
        <Select value={eventDeploymentId} onValueChange={setEventDeploymentId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_EVENTO}>Sin evento</SelectItem>
            {events?.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={createTicket.isPending || !titulo.trim() || !descripcion.trim()}
        >
          Crear ticket
        </Button>
      </div>
      {createTicket.isError && (
        <p className="text-xs text-status-critical">No se pudo crear el ticket: {(createTicket.error as Error).message}</p>
      )}
    </div>
  );
}
