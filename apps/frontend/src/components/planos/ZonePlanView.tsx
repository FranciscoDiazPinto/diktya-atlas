import { useState } from "react";
import type { ApModel } from "@diktya-atlas/shared";
import { useEventZone, useCalibrateZone } from "../../hooks/useEventZones.js";
import { usePlaceAp, useDeleteAp } from "../../hooks/useApPlacements.js";
import { useCoverageAtPoint, useCoverageGaps } from "../../hooks/useCoverage.js";
import { useAuthenticatedFileUrl } from "../../hooks/useAuthenticatedFileUrl.js";
import { useAuth } from "../../auth/AuthContext.js";
import { PlanCanvas, type PlanPoint } from "./PlanCanvas.js";
import { LoadingState } from "../common/LoadingState.js";
import { ErrorState } from "../common/ErrorState.js";
import { EmptyState } from "../common/EmptyState.js";
import { Button } from "../ui/Button.js";
import { Badge } from "../ui/Badge.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/Select.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/Card.js";

const AP_MODEL_LABEL: Record<ApModel, string> = {
  U6_MESH: "U6 Mesh (AP)",
  U7_CAMPUS: "U7 Campus (AP)",
  PRO_MAX_24: "Pro Max 24 (switch)",
  FLEX_MINI: "Flex Mini (switch)",
  FLEX: "Flex (switch)",
  FLEX_ULTRA: "Flex Ultra (switch)",
};

type Mode = "ver" | "calibrar" | "colocar" | "consultar";

export function ZonePlanView({ eventId, zoneId }: { eventId: string; zoneId: string }) {
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "TECNICO";

  const { data: zone, isLoading, isError, error, refetch } = useEventZone(eventId, zoneId);
  const planPath = zone?.planFilePath ?? zone?.venue.planFilePath ?? null;
  const {
    url: fileUrl,
    loading: loadingFile,
    error: fileError,
  } = useAuthenticatedFileUrl(planPath ? `/uploads/${planPath}` : null);

  const [mode, setMode] = useState<Mode>("ver");
  const [modeloSeleccionado, setModeloSeleccionado] = useState<ApModel>("U6_MESH");
  const [calibrationPoints, setCalibrationPoints] = useState<PlanPoint[]>([]);
  const [distanciaMetros, setDistanciaMetros] = useState("");
  const [consultaPoint, setConsultaPoint] = useState<PlanPoint | null>(null);
  const [showGaps, setShowGaps] = useState(false);
  const [planSize, setPlanSize] = useState<{ width: number; height: number } | null>(null);

  const calibrate = useCalibrateZone();
  const placeAp = usePlaceAp();
  const deleteAp = useDeleteAp();
  const { data: coverageAtPoint } = useCoverageAtPoint(eventId, zoneId, mode === "consultar" ? consultaPoint : null);
  const { data: gaps } = useCoverageGaps(
    eventId,
    zoneId,
    showGaps && planSize ? { widthPx: planSize.width, heightPx: planSize.height } : null
  );

  const isPdf = planPath?.toLowerCase().endsWith(".pdf") ?? false;

  function handleCanvasClick(point: PlanPoint) {
    if (mode === "calibrar") {
      setCalibrationPoints((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
    } else if (mode === "colocar" && canWrite) {
      placeAp.mutate({ eventId, zoneId, modelo: modeloSeleccionado, x: point.x, y: point.y });
    } else if (mode === "consultar") {
      setConsultaPoint(point);
    }
  }

  async function confirmCalibration() {
    const distancia = Number(distanciaMetros);
    if (calibrationPoints.length !== 2 || !distancia || distancia <= 0) return;
    await calibrate.mutateAsync({
      eventId,
      zoneId,
      p1: calibrationPoints[0]!,
      p2: calibrationPoints[1]!,
      distanciaMetros: distancia,
    });
    setCalibrationPoints([]);
    setDistanciaMetros("");
    setMode("ver");
  }

  if (isLoading) return <LoadingState label="Cargando zona…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!zone) return null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{zone.nombreZona}</CardTitle>
          <CardDescription>
            {zone.venue.nombre}
            {!zone.pixelesPorMetro && " · plano sin calibrar"}
          </CardDescription>
        </CardHeader>
        {canWrite && (
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "calibrar" ? "default" : "outline"}
              onClick={() => {
                setMode(mode === "calibrar" ? "ver" : "calibrar");
                setCalibrationPoints([]);
              }}
            >
              Calibrar escala
            </Button>
            <Button
              size="sm"
              variant={mode === "colocar" ? "default" : "outline"}
              onClick={() => setMode(mode === "colocar" ? "ver" : "colocar")}
              disabled={!zone.pixelesPorMetro}
              title={!zone.pixelesPorMetro ? "Calibrá la escala primero" : undefined}
            >
              Colocar equipo
            </Button>
            {mode === "colocar" && (
              <Select value={modeloSeleccionado} onValueChange={(v) => setModeloSeleccionado(v as ApModel)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AP_MODEL_LABEL) as ApModel[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {AP_MODEL_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant={mode === "consultar" ? "default" : "outline"}
              onClick={() => setMode(mode === "consultar" ? "ver" : "consultar")}
              disabled={!zone.pixelesPorMetro}
            >
              Consultar cobertura
            </Button>
            <Button
              size="sm"
              variant={showGaps ? "default" : "outline"}
              onClick={() => setShowGaps((s) => !s)}
              disabled={!zone.pixelesPorMetro}
            >
              {showGaps ? "Ocultar zonas sin cobertura" : "Ver zonas sin cobertura"}
            </Button>
          </CardContent>
        )}
      </Card>

      {mode === "calibrar" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            {calibrationPoints.length < 2 ? (
              <p>Marcá 2 puntos sobre una cota conocida del plano ({calibrationPoints.length}/2).</p>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  Distancia real (metros):
                  <input
                    type="number"
                    step="0.01"
                    value={distanciaMetros}
                    onChange={(e) => setDistanciaMetros(e.target.value)}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                <Button size="sm" onClick={confirmCalibration} disabled={calibrate.isPending || !distanciaMetros}>
                  Confirmar calibración
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "consultar" && coverageAtPoint && (
        <Card>
          <CardContent className="py-3 text-sm">
            {coverageAtPoint.cubierto ? (
              <p>
                Cubierto por {coverageAtPoint.apsEnRango.length} AP(s):{" "}
                {coverageAtPoint.apsEnRango.map((a) => `${a.modelo} (${a.distanciaMetros}m)`).join(", ")}
              </p>
            ) : (
              <p className="text-status-critical">Sin cobertura en ese punto — puede hacer falta un AP acá.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-auto p-4">
          {loadingFile ? (
            <LoadingState label="Cargando plano…" />
          ) : fileError ? (
            <ErrorState error={fileError} />
          ) : !fileUrl ? (
            <EmptyState title="Sin plano" description="Esta zona todavía no tiene un plano cargado." />
          ) : (
            <PlanCanvas
              fileUrl={fileUrl}
              isPdf={isPdf}
              aps={zone.aps}
              pixelesPorMetro={zone.pixelesPorMetro}
              gaps={showGaps ? gaps : undefined}
              calibrationPoints={mode === "calibrar" ? calibrationPoints : undefined}
              onCanvasClick={handleCanvasClick}
              onSizeChange={setPlanSize}
              onApClick={(ap) => {
                if (
                  canWrite &&
                  confirm(`¿Eliminar ${AP_MODEL_LABEL[ap.modelo]}${ap.rackLabel ? ` (${ap.rackLabel})` : ""}?`)
                ) {
                  deleteAp.mutate({ eventId, zoneId, apId: ap.id });
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      {zone.aps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Equipos colocados ({zone.aps.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {zone.aps.map((ap) => (
              <Badge key={ap.id} variant={ap.radioMetros > 0 ? "info" : "neutral"}>
                {AP_MODEL_LABEL[ap.modelo]}
                {ap.rackLabel ? ` · ${ap.rackLabel}` : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
