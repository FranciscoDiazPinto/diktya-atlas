import { useEffect, useState } from "react";
import { EventsSidebar } from "./EventsSidebar.js";
import { ZonesPanel } from "./ZonesPanel.js";
import { ZonePlanView } from "./ZonePlanView.js";
import { EventReportPanel } from "./EventReportPanel.js";
import { EmptyState } from "../common/EmptyState.js";
import { Card, CardContent } from "../ui/Card.js";

const SELECTED_EVENT_KEY = "atlas-planos-selected-event";
const SELECTED_ZONE_KEY = "atlas-planos-selected-zone";

/**
 * Recuerda el evento/zona elegidos en localStorage: al volver a esta vista
 * (o recargar la página) se carga automáticamente lo último habilitado, en
 * vez de arrancar en blanco cada vez.
 */
export function PlanosView() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => localStorage.getItem(SELECTED_EVENT_KEY));
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(() => localStorage.getItem(SELECTED_ZONE_KEY));

  useEffect(() => {
    if (selectedEventId) localStorage.setItem(SELECTED_EVENT_KEY, selectedEventId);
    else localStorage.removeItem(SELECTED_EVENT_KEY);
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedZoneId) localStorage.setItem(SELECTED_ZONE_KEY, selectedZoneId);
    else localStorage.removeItem(SELECTED_ZONE_KEY);
  }, [selectedZoneId]);

  return (
    <div className="flex gap-4">
      <EventsSidebar
        selectedEventId={selectedEventId}
        onSelectEvent={(id) => {
          setSelectedEventId(id);
          setSelectedZoneId(null);
        }}
      />

      <div className="flex flex-1 flex-col gap-4">
        {!selectedEventId ? (
          <EmptyState
            title="Elegí un evento"
            description="Seleccioná (o creá) un evento para ver sus zonas/planos. Un evento puede tener varias zonas — ej. distintos pabellones o estacionamientos."
          />
        ) : (
          <>
            <Card>
              <CardContent className="p-3">
                <ZonesPanel
                  eventId={selectedEventId}
                  selectedZoneId={selectedZoneId}
                  onSelectZone={setSelectedZoneId}
                />
              </CardContent>
            </Card>

            <EventReportPanel key={selectedEventId} eventId={selectedEventId} />

            {selectedZoneId ? (
              <ZonePlanView eventId={selectedEventId} zoneId={selectedZoneId} />
            ) : (
              <EmptyState title="Elegí una zona" description="Seleccioná (o creá) una zona/pabellón de este evento." />
            )}
          </>
        )}
      </div>
    </div>
  );
}
