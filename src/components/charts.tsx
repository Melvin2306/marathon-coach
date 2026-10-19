// Small SVG chart kit, used only inside client components. One y-axis per chart (two measures get two charts),
// thin marks, recessive grid, and a hover layer on every chart.
import { useEffect, useRef, useState } from "react";

const PAD = { top: 12, right: 12, bottom: 24 };

/** Tracks the container width so charts draw at real size and text stays legible. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Left padding that fits the longest y-axis label. */
const leftPad = (labels: string[]) => Math.max(...labels.map((l) => l.length)) * 6 + 12;

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  /** dots for individual observations, line for trends */
  mark: "line" | "dots";
  /** dashed line, e.g. for a projection */
  dash?: boolean;
}

export interface RefLine {
  y: number;
  label: string;
}

export function LineChart({
  series,
  height = 200,
  formatX,
  formatY,
  refLines = [],
  invertY = false,
  yPadding = 0.1,
  ariaLabel,
}: {
  series: Series[];
  height?: number;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  refLines?: RefLine[];
  /** for paces: faster (smaller) values plot higher */
  invertY?: boolean;
  yPadding?: number;
  ariaLabel: string;
}) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y)];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  const ticks = niceTicks(Math.min(...ys) - span * yPadding, Math.max(...ys) + span * yPadding);
  const [y0, y1] = [ticks[0], ticks[ticks.length - 1]];
  const left = leftPad(ticks.map(formatY));
  const plotW = W - left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const sx = (x: number) => left + (x1 === x0 ? plotW / 2 : ((x - x0) / (x1 - x0)) * plotW);
  const sy = (y: number) => {
    const f = (y - y0) / (y1 - y0 || 1);
    return PAD.top + (invertY ? f : 1 - f) * plotH;
  };
  const xTicks = niceTicks(x0, x1, Math.max(2, Math.floor(W / 130))).filter((x) => x >= x0 && x <= x1);

  // Hover snaps to the nearest x with data.
  const uniqueX = [...new Set(xs)].sort((a, b) => a - b);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = x0 + ((((e.clientX - rect.left) / rect.width) * W - left) / plotW) * (x1 - x0);
    setHoverX(uniqueX.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), uniqueX[0]));
  };
  const hovered = hoverX === null ? [] : series.flatMap((s) => s.points.filter((p) => p.x === hoverX).map((p) => ({ s, p })));

  return (
    <div ref={ref} className="relative">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color, mark: s.dash ? "dash" : s.mark }))} />}
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full touch-none" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHoverX(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={left - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {formatX(x)}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={left} x2={W - PAD.right} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--text-2)" strokeDasharray="4 4" strokeWidth={1} />
            <text x={W - PAD.right} y={sy(r.y) - 4} textAnchor="end" fontSize="10" fill="var(--text-2)">
              {r.label}
            </text>
          </g>
        ))}
        {series.map((s) =>
          s.mark === "line" ? (
            <path
              key={s.id}
              d={s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x)},${sy(p.y)}`).join("")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash ? "6 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <g key={s.id}>
              {s.points.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} opacity={0.75} />
              ))}
            </g>
          ),
        )}
        {hoverX !== null && (
          <g pointerEvents="none">
            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--text-2)" strokeWidth={1} />
            {hovered.map(({ s, p }) => (
              <circle key={s.id} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hoverX !== null && hovered.length > 0 && (
        <Tooltip leftPct={(sx(hoverX) / W) * 100}>
          <div className="font-medium">{formatX(hoverX)}</div>
          {hovered.map(({ s, p }) => (
            <div key={s.id} className="tabular flex items-center gap-1.5 text-ink-2">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label} {formatY(p.y)}
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export interface Column {
  label: string;
  values: number[];
}

/** Stacked columns, e.g. minutes per heart-rate zone per week. */
export function StackedColumns({
  columns,
  colors,
  labels,
  formatValue,
  height = 200,
  ariaLabel,
}: {
  columns: Column[];
  colors: string[];
  labels: string[];
  formatValue: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const totals = columns.map((c) => c.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(0, Math.max(1, ...totals));
  const top = ticks[ticks.length - 1];
  const left = leftPad(ticks.map(formatValue));
  const plotW = W - left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, columns.length);
  const barW = Math.min(24, band - 6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const GAP = 2;

  return (
    <div ref={ref} className="relative">
      <Legend items={labels.map((label, i) => ({ label, color: colors[i], mark: "bar" as const }))} />
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)">
              {formatValue(t)}
            </text>
          </g>
        ))}
        {columns.map((c, i) => {
          const x = left + i * band + (band - barW) / 2;
          let acc = 0;
          const nonEmpty = c.values.map((v, k) => (v > 0 ? k : -1)).filter((k) => k >= 0);
          const topIndex = nonEmpty[nonEmpty.length - 1];
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={left + i * band} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {c.values.map((v, k) => {
                if (v <= 0) return null;
                const yTop = y(acc + v);
                const yBottom = y(acc);
                acc += v;
                const h = Math.max(0, yBottom - yTop - (k === topIndex ? 0 : GAP));
                const r = k === topIndex ? Math.min(4, h, barW / 2) : 0;
                const d = `M${x},${yBottom} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yBottom} Z`;
                return <path key={k} d={d} fill={colors[k]} opacity={hover === null || hover === i ? 1 : 0.6} />;
              })}
              {i % Math.max(1, Math.ceil(columns.length / Math.floor(W / 70))) === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip leftPct={((left + hover * band + band / 2) / W) * 100}>
          <div className="font-medium">{columns[hover].label}</div>
          {labels.map((l, k) => (
            <div key={l} className="tabular flex items-center gap-1.5 text-ink-2">
              <span className="size-2 rounded-sm" style={{ background: colors[k] }} />
              {l} {formatValue(columns[hover].values[k])}
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** One horizontal 100% bar, e.g. a run's time in each heart-rate zone. */
export function ShareBar({ values, colors, labels, format }: { values: number[]; colors: string[]; labels: string[]; format: (v: number) => string }) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={labels.map((l, i) => `${l} ${format(values[i])}`).join(", ")}>
        {values.map((v, i) => (v > 0 ? <div key={i} style={{ flex: v, background: colors[i] }} title={`${labels[i]}: ${format(v)}`} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {values.map((v, i) =>
          v > 0 ? (
            <span key={i} className="tabular flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: colors[i] }} />
              {labels[i]} {format(v)} · {Math.round((v / total) * 100)}%
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; mark: "line" | "dash" | "dots" | "bar" }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.mark === "line" ? (
            <span className="h-0.5 w-3 rounded" style={{ background: it.color }} />
          ) : it.mark === "dash" ? (
            <span className="w-3 border-t-2 border-dashed" style={{ borderColor: it.color }} />
          ) : (
            <span className={`size-2.5 ${it.mark === "dots" ? "rounded-full" : "rounded-sm"}`} style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-6 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: `clamp(0px, calc(${leftPct}% - 80px), calc(100% - 170px))` }}
    >
      {children}
    </div>
  );
}

export interface CalendarDay {
  /** ISO date */
  date: string;
  value: number;
}

/**
 * GitHub-style activity calendar: one column per week, Monday at the top.
 * `bins` are the lower bounds of each color step (value > 0).
 */
export function CalendarHeatmap({
  weeks,
  colors,
  bins,
  weekdayLabels,
  monthLabel,
  formatTooltip,
  ariaLabel,
  legendLess,
  legendMore,
}: {
  /** columns of 7 days, Monday first; null for days after today */
  weeks: (CalendarDay | null)[][];
  colors: string[];
  bins: number[];
  weekdayLabels: string[];
  monthLabel: (date: string) => string | null;
  formatTooltip: (day: CalendarDay) => string;
  ariaLabel: string;
  legendLess: string;
  legendMore: string;
}) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<CalendarDay | null>(null);
  const left = 28;
  const top = 16;
  const gap = 2;
  const cell = Math.max(6, Math.min(16, Math.floor((W - left) / weeks.length) - gap));
  const height = top + 7 * (cell + gap);
  const colorFor = (v: number) => {
    if (v <= 0) return "var(--surface-2)";
    let k = 0;
    for (let i = 0; i < bins.length; i++) if (v >= bins[i]) k = i;
    return colors[k];
  };
  const hoverPos = hover
    ? (() => {
        const wi = weeks.findIndex((w) => w.some((d) => d?.date === hover.date));
        return ((left + wi * (cell + gap)) / W) * 100;
      })()
    : 0;

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {weekdayLabels.map((l, d) =>
          d % 2 === 0 ? (
            <text key={d} x={0} y={top + d * (cell + gap) + cell / 2} dy="0.32em" fontSize="9" fill="var(--muted)">
              {l}
            </text>
          ) : null,
        )}
        {weeks.map((week, wi) => {
          const label = week[0] ? monthLabel(week[0].date) : null;
          return (
            <g key={wi}>
              {label && (
                <text x={left + wi * (cell + gap)} y={10} fontSize="9" fill="var(--muted)">
                  {label}
                </text>
              )}
              {week.map((day, d) =>
                day ? (
                  <rect
                    key={d}
                    x={left + wi * (cell + gap)}
                    y={top + d * (cell + gap)}
                    width={cell}
                    height={cell}
                    rx={2}
                    fill={colorFor(day.value)}
                    stroke={hover?.date === day.date ? "var(--text)" : "none"}
                    onMouseEnter={() => setHover(day)}
                  />
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted">
        {legendLess}
        {["var(--surface-2)", ...colors].map((c) => (
          <span key={c} className="size-2.5 rounded-sm" style={{ background: c }} />
        ))}
        {legendMore}
      </div>
      {hover && <Tooltip leftPct={hoverPos}>{formatTooltip(hover)}</Tooltip>}
    </div>
  );
}
