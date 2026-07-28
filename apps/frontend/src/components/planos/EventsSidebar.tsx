import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useEventDeployments, useCreateEventDeployment } from "../../hooks/useEventDeployments.js";
import { Button } from "../ui/Button.js";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card.js";
import { LoadingState } from "../common/LoadingState.js";
import { EmptyState } from "../common/EmptyState.js";

export function EventsSidebar({
  selectedEventId,
  onSelectEvent,
}: {
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
}) {
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "TECNICO";

  const { data: events, isLoading } = useEventDeployments();
  const createEvent = useCreateEventDeployment();

  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");

  async function handleCreate() {
    if (!nombre.trim() || !fecha) return;
    const event = await createEvent.mutateAsync({ nombre: nombre.trim(), fecha });
    setNombre("");
    setFecha("");
    onSelectEvent(event.id);
  }

  return (
    <div className="flex w-64 shrink-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading ? (
            <LoadingState label="Cargando…" />
          ) : !events || events.length === 0 ? (
            <EmptyState title="Sin eventos" description="Creá el primero." />
          ) : (
            <ul className="flex flex-col gap-1">
              {events.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(ev.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm",
                      ev.id === selectedEventId
                        ? "bg-slate-100 font-medium text-brand-navy dark:bg-slate-800 dark:text-brand-cyan"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    )}
                  >
                    {ev.nombre}
                    <span className="block text-xs text-slate-400">
                      {new Date(ev.fecha).toLocaleDateString("es-CL")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del evento"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <Button size="sm" onClick={handleCreate} disabled={createEvent.isPending || !nombre.trim() || !fecha}>
                <Plus className="h-3.5 w-3.5" /> Nuevo evento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
