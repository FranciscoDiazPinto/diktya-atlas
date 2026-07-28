import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useVenues, useCreateVenue } from "../../hooks/useVenues.js";
import { useEventZones, useCreateEventZone } from "../../hooks/useEventZones.js";
import { Button } from "../ui/Button.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import { LoadingState } from "../common/LoadingState.js";

/**
 * Un evento (ej. "Expomin 2026") puede desplegarse en varias zonas/planos
 * a la vez (pabellones, estacionamientos) — cada una con su propio recinto
 * y su propia calibración de escala. Este panel lista las zonas del
 * evento como chips seleccionables + el form para crear una nueva.
 */
export function ZonesPanel({
  eventId,
  selectedZoneId,
  onSelectZone,
}: {
  eventId: string;
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
}) {
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "TECNICO";

  const { data: zones, isLoading } = useEventZones(eventId);
  const { data: venues } = useVenues();
  const createVenue = useCreateVenue();
  const createZone = useCreateEventZone();

  const [showForm, setShowForm] = useState(false);
  const [nombreZona, setNombreZona] = useState("");
  const [venueId, setVenueId] = useState("");
  const [newVenueMode, setNewVenueMode] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueFile, setNewVenueFile] = useState<File | null>(null);
  const [zoneFile, setZoneFile] = useState<File | null>(null);

  async function handleCreateZone() {
    if (!nombreZona.trim()) return;

    let resolvedVenueId = venueId;
    if (newVenueMode) {
      if (!newVenueName.trim() || !newVenueFile) return;
      const venue = await createVenue.mutateAsync({ nombre: newVenueName.trim(), file: newVenueFile });
      resolvedVenueId = venue.id;
    }
    if (!resolvedVenueId) return;

    const zone = await createZone.mutateAsync({
      eventId,
      venueId: resolvedVenueId,
      nombreZona: nombreZona.trim(),
      file: zoneFile ?? undefined,
    });

    setNombreZona("");
    setNewVenueName("");
    setNewVenueFile(null);
    setZoneFile(null);
    setNewVenueMode(false);
    setVenueId("");
    setShowForm(false);
    onSelectZone(zone.id);
  }

  if (isLoading) return <LoadingState label="Cargando zonas…" />;

  const canSubmit =
    nombreZona.trim().length > 0 &&
    (newVenueMode ? newVenueName.trim().length > 0 && Boolean(newVenueFile) : Boolean(venueId));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {zones?.map((zone) => (
        <button
          key={zone.id}
          type="button"
          onClick={() => onSelectZone(zone.id)}
          title={zone.pixelesPorMetro ? undefined : "Plano sin calibrar"}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            zone.id === selectedZoneId
              ? "bg-brand-navy text-white dark:bg-brand-cyan dark:text-slate-950"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          )}
        >
          {zone.nombreZona}
          {!zone.pixelesPorMetro && " ⚠"}
        </button>
      ))}

      {canWrite && !showForm && (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva zona
        </Button>
      )}

      {canWrite && showForm && (
        <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <label className="flex flex-col gap-1 text-xs">
            Nombre de la zona
            <input
              value={nombreZona}
              onChange={(e) => setNombreZona(e.target.value)}
              placeholder="Pabellón 3"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {!newVenueMode ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                Recinto
                <Select value={venueId} onValueChange={setVenueId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Elegir recinto" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button size="sm" variant="ghost" onClick={() => setNewVenueMode(true)}>
                + nuevo recinto
              </Button>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                Nombre del recinto
                <input
                  value={newVenueName}
                  onChange={(e) => setNewVenueName(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Plano base (PDF/imagen)
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setNewVenueFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
              </label>
              <Button size="sm" variant="ghost" onClick={() => setNewVenueMode(false)}>
                usar recinto existente
              </Button>
            </>
          )}

          <label className="flex flex-col gap-1 text-xs">
            Override del plano (opcional)
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setZoneFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </label>

          <Button
            size="sm"
            onClick={handleCreateZone}
            disabled={createZone.isPending || createVenue.isPending || !canSubmit}
          >
            Crear zona
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
