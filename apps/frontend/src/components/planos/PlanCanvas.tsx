import { useEffect, useRef, useState, useCallback, type MouseEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { ApiApPlacement, CoverageGapCell } from "../../types/api.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanCanvasProps {
  fileUrl: string;
  isPdf: boolean;
  aps: ApiApPlacement[];
  pixelesPorMetro: number | null;
  gaps?: CoverageGapCell[];
  calibrationPoints?: PlanPoint[];
  onCanvasClick?: (point: PlanPoint) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onApClick?: (ap: ApiApPlacement) => void;
}

/**
 * Renderiza el plano (PDF vía pdfjs-dist, o imagen) en un <canvas>, y
 * superpone un <svg> del mismo tamaño para los marcadores de AP, sus
 * círculos de radio, las celdas sin cobertura y los puntos de calibración
 * — así no hay que re-renderizar el PDF completo cada vez que cambia un
 * marcador. Todas las coordenadas (clicks, APs, gaps) son en píxeles del
 * plano renderizado, no de pantalla.
 */
export function PlanCanvas({
  fileUrl,
  isPdf,
  aps,
  pixelesPorMetro,
  gaps,
  calibrationPoints,
  onCanvasClick,
  onSizeChange,
  onApClick,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setRenderError(null);

      if (isPdf) {
        const doc = await pdfjsLib.getDocument(fileUrl).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setSize({ width: viewport.width, height: viewport.height });
        onSizeChange?.({ width: viewport.width, height: viewport.height });
      } else {
        const img = new Image();
        img.src = fileUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("No se pudo cargar la imagen del plano"));
        });
        if (cancelled) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        setSize({ width: img.naturalWidth, height: img.naturalHeight });
        onSizeChange?.({ width: img.naturalWidth, height: img.naturalHeight });
      }
    }

    render().catch((err: unknown) => {
      if (!cancelled) setRenderError(err instanceof Error ? err.message : "No se pudo renderizar el plano");
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, isPdf]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!onCanvasClick || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      onCanvasClick({
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      });
    },
    [onCanvasClick]
  );

  if (renderError) {
    return <p className="text-sm text-status-critical">{renderError}</p>;
  }

  return (
    <div className="relative inline-block cursor-crosshair" onClick={handleClick}>
      <canvas ref={canvasRef} className="block max-w-full border border-slate-200 dark:border-slate-800" />
      {size && (
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={{ width: "100%", height: "auto" }}
        >
          {pixelesPorMetro &&
            aps
              .filter((ap) => ap.radioMetros > 0)
              .map((ap) => (
                <circle
                  key={`radio-${ap.id}`}
                  cx={ap.x}
                  cy={ap.y}
                  r={ap.radioMetros * pixelesPorMetro}
                  fill="rgba(0,144,214,0.12)"
                  stroke="#0090d6"
                  strokeWidth={2}
                />
              ))}

          {gaps?.map((gap, i) => (
            <rect key={`gap-${i}`} x={gap.x - 4} y={gap.y - 4} width={8} height={8} fill="#d03b3b" opacity={0.6} />
          ))}

          {aps.map((ap) => (
            <circle
              key={ap.id}
              className="pointer-events-auto cursor-pointer"
              cx={ap.x}
              cy={ap.y}
              r={6}
              fill="#112f47"
              stroke="white"
              strokeWidth={1.5}
              onClick={(e) => {
                e.stopPropagation();
                onApClick?.(ap);
              }}
            />
          ))}

          {calibrationPoints && calibrationPoints.length === 2 && (
            <line
              x1={calibrationPoints[0]!.x}
              y1={calibrationPoints[0]!.y}
              x2={calibrationPoints[1]!.x}
              y2={calibrationPoints[1]!.y}
              stroke="#fab219"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
          {calibrationPoints?.map((p, i) => (
            <circle key={`calib-${i}`} cx={p.x} cy={p.y} r={5} fill="#fab219" stroke="#112f47" strokeWidth={1} />
          ))}
        </svg>
      )}
    </div>
  );
}
