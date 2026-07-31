import { useState } from "react";

export interface HistogramBucket {
  label: string;
  cantidad: number;
}

const WIDTH = 640;
const HEIGHT = 160;
const PAD = { top: 8, right: 8, bottom: 28, left: 28 };
const BAR_MAX_THICKNESS = 24;
const GAP = 2;

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = max / pow <= 2 ? 2 : max / pow <= 5 ? 5 : 10;
  return Math.ceil(max / (step * pow / 10)) * (step * pow / 10);
}

/** Distribución de duración de cortes -> histograma (dataviz/choosing-a-form.md). */
export function OutageHistogramChart({ buckets }: { buckets: HistogramBucket[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...buckets.map((b) => b.cantidad), 1));

  const slotW = innerW / buckets.length;
  const barW = Math.min(BAR_MAX_THICKNESS, slotW - GAP * 2);

  const yFor = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max].map((v) => Math.round(v));

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Distribución de duración de cortes">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yFor(t)} y2={yFor(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[9px] dark:fill-slate-500">
              {t}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          const x = PAD.left + i * slotW + (slotW - barW) / 2;
          const y = yFor(b.cantidad);
          const h = PAD.top + innerH - y;
          const hovered = hoverIdx === i;
          return (
            <g key={b.label}>
              <rect
                x={x - (24 - barW) / 2}
                y={PAD.top}
                width={Math.max(barW, 24)}
                height={innerH}
                fill="transparent"
                onPointerEnter={() => setHoverIdx(i)}
                onPointerLeave={() => setHoverIdx(null)}
              />
              {h > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={4}
                  fill="var(--color-brand-cyan)"
                  opacity={hovered ? 0.85 : 1}
                  className="pointer-events-none transition-opacity"
                />
              )}
              <text x={x + barW / 2} y={HEIGHT - PAD.bottom + 12} textAnchor="middle" className="fill-slate-500 text-[9px] dark:fill-slate-400">
                {b.label}
              </text>
              {hovered && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-slate-900 text-[10px] font-semibold tabular-nums dark:fill-slate-100">
                  {b.cantidad}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
