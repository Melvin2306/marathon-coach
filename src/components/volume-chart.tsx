"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { formatDistance, unitLength } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import type { PlanWeek, Units } from "@/lib/types";

const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/** Planned weekly volume (target column) with actual volume inset on top. */
export function VolumeChart({
  weeks,
  actual,
  currentIndex,
  units,
}: {
  weeks: PlanWeek[];
  actual: number[];
  currentIndex: number;
  units: Units;
}) {
  const { t, locale } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const unit = unitLength(units);
  const max = Math.max(...weeks.map((w) => w.volume), ...actual) / unit;
  const step = max > 80 ? 20 : 10;
  const top = Math.ceil(max / step) * step || step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  const width = 720;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / weeks.length;
  const barW = Math.min(14, band - 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const phaseStarts = weeks.filter((w, i) => i === 0 || weeks[i - 1].phase !== w.phase);
  const hovered = hover !== null ? weeks[hover] : null;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--series-target)" }} /> {t("chart.planned")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> {t("chart.actual")}
        </span>
        <span className="text-muted">{t("chart.caption", { units })}</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full min-w-[640px]" role="img" aria-label={t("chart.aria")} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        {phaseStarts.map((w) => (
          <g key={w.index}>
            {w.index > 0 && (
              <line x1={PAD.left + w.index * band} x2={PAD.left + w.index * band} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border)" strokeDasharray="2 3" />
            )}
            <text x={PAD.left + w.index * band + 4} y={HEIGHT - 6} fontSize="10" fill="var(--muted)">
              {t(`phase.${w.phase}.short`)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = PAD.left + i * band + band / 2;
          const planned = w.volume / unit;
          const done = (actual[i] ?? 0) / unit;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.left + i * band} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {i === currentIndex && (
                <rect x={PAD.left + i * band} y={PAD.top} width={band} height={plotH} fill="var(--accent)" opacity={0.08} />
              )}
              <ColumnPath x={cx - barW / 2} w={barW} y0={y(0)} y1={y(planned)} fill="var(--series-target)" opacity={hover === i ? 1 : 0.9} />
              {done > 0 && <ColumnPath x={cx - barW / 4} w={barW / 2} y0={y(0)} y1={y(done)} fill="var(--series-1)" />}
            </g>
          );
        })}
      </svg>
      </div>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${((PAD.left + hover * band + band / 2) / width) * 100}% - 70px), calc(100% - 150px))` }}
        >
          <div className="font-medium">
            {t("plan.week", { n: hovered.index + 1 })} · {formatDate(hovered.start, undefined, locale)}
          </div>
          <div className="text-muted">
            {t(`phase.${hovered.phase}.name`)}
            {hovered.cutback ? ` · ${t("plan.cutback")}` : ""}
          </div>
          <div className="tabular mt-1 text-ink-2">
            {t("chart.planned")} {formatDistance(hovered.volume, units, 0, locale)}
          </div>
          <div className="tabular text-ink-2">
            {t("chart.actual")} {formatDistance(actual[hover] ?? 0, units, 0, locale)}
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnPath({ x, w, y0, y1, fill, opacity }: { x: number; w: number; y0: number; y1: number; fill: string; opacity?: number }) {
  const h = y0 - y1;
  if (h <= 0) return null;
  const r = Math.min(4, w / 2, h);
  const d = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  return <path d={d} fill={fill} opacity={opacity} />;
}
