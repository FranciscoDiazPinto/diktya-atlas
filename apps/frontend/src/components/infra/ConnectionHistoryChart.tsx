import { useMemo, useState, useRef } from "react";

export interface SerieTemporalPoint {
  timestamp: string;
  porcentajeOnline: number | null;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
const GRID_PCTS = [0, 25, 50, 75, 100];

function formatHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Único serie -> sin caja de leyenda (el título de la card ya dice qué se
 * grafica, ver dataviz/marks-and-anatomy.md). Los huecos "sin datos" cortan
 * el path en tramos en vez de interpolar a través de ellos — interpolar
 * inventaría disponibilidad que no se midió.
 */
export function ConnectionHistoryChart({ data }: { data: SerieTemporalPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const xFor = (i: number) => PAD.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
  const yFor = (pct: number) => PAD.top + innerH - (pct / 100) * innerH;

  const segmentos = useMemo(() => {
    const grupos: Array<Array<{ i: number; pct: number }>> = [];
    let actual: Array<{ i: number; pct: number }> = [];
    data.forEach((p, i) => {
      if (p.porcentajeOnline === null) {
        if (actual.length) grupos.push(actual);
        actual = [];
        return;
      }
      actual.push({ i, pct: p.porcentajeOnline });
    });
    if (actual.length) grupos.push(actual);
    return grupos;
  }, [data]);

  function pathFor(seg: Array<{ i: number; pct: number }>): string {
    return seg.map((p, idx) => `${idx === 0 ? "M" : "L"} ${xFor(p.i)} ${yFor(p.pct)}`).join(" ");
  }

  function areaFor(seg: Array<{ i: number; pct: number }>): string {
    const linea = pathFor(seg);
    const first = seg[0]!;
    const last = seg[seg.length - 1]!;
    return `${linea} L ${xFor(last.i)} ${yFor(0)} L ${xFor(first.i)} ${yFor(0)} Z`;
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relX - PAD.left) / innerW;
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  }

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverPct = hoverIdx !== null ? hoverIdx / Math.max(1, data.length - 1) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label="Historial de conexión: porcentaje de nodos en línea a lo largo del tiempo"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {GRID_PCTS.map((pct) => (
            <g key={pct}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(pct)}
                y2={yFor(pct)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={yFor(pct)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[9px] dark:fill-slate-500">
                {pct}
              </text>
            </g>
          ))}

          {segmentos.map((seg, i) => (
            <g key={i}>
              {seg.length > 1 && (
                <>
                  <path d={areaFor(seg)} fill="var(--color-brand-cyan)" fillOpacity={0.1} stroke="none" />
                  <path d={pathFor(seg)} fill="none" stroke="var(--color-brand-cyan)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </>
              )}
              {/* Marcador en el último punto de cada tramo — también cubre el caso de un tramo
                  de un solo punto (recién empezó a haber datos), que sin esto no pintaría nada. */}
              <circle
                cx={xFor(seg[seg.length - 1]!.i)}
                cy={yFor(seg[seg.length - 1]!.pct)}
                r={4}
                fill="var(--color-brand-cyan)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </g>
          ))}

          {hover && hover.porcentajeOnline !== null && (
            <>
              <line x1={xFor(hoverIdx!)} x2={xFor(hoverIdx!)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--border)" strokeWidth={1} />
              <circle cx={xFor(hoverIdx!)} cy={yFor(hover.porcentajeOnline)} r={4} fill="var(--color-brand-cyan)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-sm dark:border-slate-700 dark:bg-slate-800"
            style={{ left: `clamp(30px, ${hoverPct * 100}%, calc(100% - 30px))` }}
          >
            <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {hover.porcentajeOnline === null ? "Sin datos" : `${hover.porcentajeOnline.toFixed(1)}%`}
            </p>
            <p className="text-slate-500 dark:text-slate-400">{formatHora(hover.timestamp)}</p>
          </div>
        )}
      </div>

      <details className="text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <div className="mt-1 max-h-48 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="pr-2 font-medium">Momento</th>
                <th className="font-medium">% en línea</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.timestamp}>
                  <td className="pr-2 tabular-nums">{formatHora(p.timestamp)}</td>
                  <td className="tabular-nums">{p.porcentajeOnline === null ? "Sin datos" : `${p.porcentajeOnline.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
