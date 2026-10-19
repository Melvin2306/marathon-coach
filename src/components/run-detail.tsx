"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { formatClock, formatDistance, formatPace } from "@/lib/format";
import { timeInZones, zoneRanges, ZONES } from "@/lib/heart";
import { decodePolyline } from "@/lib/polyline";
import { loadStravaDetail } from "@/lib/strava/client";
import { SERIES_STEP, type Run, type Units } from "@/lib/types";
import { LineChart, ShareBar } from "./charts";

export const ZONE_COLORS = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)"];

/** Everything recorded for one run: metrics, heart-rate zones, charts, splits and route. */
export function RunDetail({ run, units, maxHr }: { run: Run; units: Units; maxHr: number | null }) {
  const { t, locale } = useI18n();
  const d = run.details ?? {};
  const [loading, setLoading] = useState(false);
  const canLoadStrava = !!d.stravaId && !d.stravaDetail;

  useEffect(() => {
    if (!canLoadStrava) return;
    let cancelled = false;
    // Defer so the panel renders before the request starts.
    const timer = setTimeout(() => {
      setLoading(true);
      loadStravaDetail(run.id, d.stravaId!).finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canLoadStrava, run.id, d.stravaId]);

  const zones = maxHr ? timeInZones(run, maxHr) : null;
  const ranges = maxHr ? zoneRanges(maxHr) : null;
  const zoneLabels = ZONES.map((z, i) => `${t(`zone.${z}` as MessageKey)}${ranges ? ` (${ranges[i][0]}–${ranges[i][1]})` : ""}`);
  const minutes = (s: number) => `${Math.round(s / 60)} min`;
  const toMinutes = (series: number[]) => series.map((y, i) => ({ x: (i * SERIES_STEP) / 60, y })).filter((p) => p.y > 0);

  const stats: [MessageKey, string | undefined][] = [
    ["detail.avgHr", run.avgHr ? `${run.avgHr} bpm` : undefined],
    ["detail.maxHr", run.maxHr ? `${run.maxHr} bpm` : undefined],
    ["detail.cadence", d.cadence ? `${d.cadence} spm` : undefined],
    ["detail.elevation", d.elevationGain !== undefined ? `${d.elevationGain} m` : undefined],
    ["detail.calories", d.calories ? `${d.calories} kcal` : undefined],
    ["detail.power", d.power ? `${d.power} W` : undefined],
    ["detail.stride", d.strideLength ? `${d.strideLength.toLocaleString(locale)} m` : undefined],
    ["detail.groundContact", d.groundContact ? `${d.groundContact} ms` : undefined],
    ["detail.oscillation", d.verticalOscillation ? `${d.verticalOscillation.toLocaleString(locale)} cm` : undefined],
    ["detail.maxSpeed", d.maxSpeed ? formatPace(1000 / d.maxSpeed, units) : undefined],
    ["detail.weather", d.temperature !== undefined ? `${d.temperature.toLocaleString(locale)} °C${d.humidity ? ` · ${d.humidity}%` : ""}` : undefined],
    ["detail.elapsed", d.elapsed && d.elapsed > run.duration + 30 ? formatClock(d.elapsed) : undefined],
    ["detail.start", d.startTime],
    ["detail.relativeEffort", d.relativeEffort ? String(d.relativeEffort) : undefined],
    ["detail.kudos", d.kudos !== undefined ? `${d.kudos}${d.prs ? ` · ${d.prs} PR` : ""}` : undefined],
    ["detail.shoe", d.shoe],
    ["detail.device", d.device],
  ];

  return (
    <div className="mt-3 space-y-5 rounded-xl bg-surface-2 p-4">
      {d.description && <p className="text-sm text-ink-2">{d.description}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {stats
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{t(k)}</dt>
              <dd className="tabular text-sm font-medium">{v}</dd>
            </div>
          ))}
      </dl>

      {zones && (
        <section>
          <h4 className="mb-2 text-xs font-medium text-ink-2">{t(zones.estimated ? "detail.zonesEstimated" : "detail.zones")}</h4>
          <ShareBar values={zones.seconds} colors={ZONE_COLORS} labels={zoneLabels} format={minutes} />
        </section>
      )}

      {d.hrSeries?.some((v) => v > 0) && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-ink-2">{t("detail.hrChart")}</h4>
          <LineChart
            height={150}
            ariaLabel={t("detail.hrChart")}
            series={[{ id: "hr", label: t("detail.avgHr"), color: "var(--hr)", mark: "line", points: toMinutes(d.hrSeries) }]}
            formatX={(x) => `${Math.round(x)} min`}
            formatY={(y) => `${Math.round(y)}`}
            refLines={run.avgHr ? [{ y: run.avgHr, label: `Ø ${run.avgHr} bpm` }] : []}
          />
        </section>
      )}
      {d.paceSeries?.some((v) => v > 0) && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-ink-2">{t("detail.paceChart")}</h4>
          <LineChart
            height={150}
            invertY
            ariaLabel={t("detail.paceChart")}
            series={[{ id: "pace", label: t("paces.col.pace"), color: "var(--pace)", mark: "line", points: toMinutes(d.paceSeries).filter((p) => p.y < 900) }]}
            formatX={(x) => `${Math.round(x)} min`}
            formatY={(y) => formatPace(y, units)}
          />
        </section>
      )}
      {d.altitudeSeries && d.altitudeSeries.length > 1 && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-ink-2">{t("detail.altitudeChart")}</h4>
          <LineChart
            height={110}
            ariaLabel={t("detail.altitudeChart")}
            series={[{ id: "alt", label: t("detail.elevation"), color: "var(--altitude)", mark: "line", points: d.altitudeSeries.map((y, i) => ({ x: (i * SERIES_STEP) / 60, y })) }]}
            formatX={(x) => `${Math.round(x)} min`}
            formatY={(y) => `${Math.round(y)} m`}
          />
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {d.splits && d.splits.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-medium text-ink-2">{t("detail.splits")}</h4>
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1 font-normal">km</th>
                  <th className="pb-1 text-right font-normal">{t("paces.col.pace")}</th>
                  <th className="pb-1 text-right font-normal">♥</th>
                  <th className="pb-1 text-right font-normal">↗</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.splits.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1">{s.distance < 900 ? formatDistance(d.splits!.slice(0, i + 1).reduce((a, x) => a + x.distance, 0), "km", 2, locale) : i + 1}</td>
                    <td className="py-1 text-right">{formatPace(s.time / (s.distance / 1000), units)}</td>
                    <td className="py-1 text-right text-ink-2">{s.hr ?? "–"}</td>
                    <td className="py-1 text-right text-ink-2">{s.elevation !== undefined ? `${s.elevation > 0 ? "+" : ""}${s.elevation}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div className="space-y-5">
          {d.bestEfforts && d.bestEfforts.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-medium text-ink-2">{t("detail.bestEfforts")}</h4>
              <ul className="tabular space-y-1 text-sm">
                {d.bestEfforts.map((e) => (
                  <li key={e.name} className="flex justify-between gap-3">
                    <span>{e.name}</span>
                    <span>
                      {e.prRank && <span className="mr-2 rounded bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">PR{e.prRank > 1 ? ` #${e.prRank}` : ""}</span>}
                      {formatClock(e.time)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.polyline && <RouteSketch polyline={d.polyline} label={t("detail.route")} />}
        </div>
      </div>
      {loading && <p className="text-xs text-muted">{t("detail.loadingStrava")}</p>}
    </div>
  );
}

/** The route's shape, drawn from Strava's summary polyline without a map service. */
function RouteSketch({ polyline, label }: { polyline: string; label: string }) {
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;
  const lat0 = points.reduce((s, p) => s + p[0], 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map(([lat, lng]) => [lng * k, -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const S = 200;
  const pad = 10;
  const px = (x: number) => pad + ((x - minX) / size) * (S - 2 * pad) + ((size - (maxX - minX)) / size) * ((S - 2 * pad) / 2);
  const py = (y: number) => pad + ((y - minY) / size) * (S - 2 * pad) + ((size - (maxY - minY)) / size) * ((S - 2 * pad) / 2);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join("");
  const [sx, sy] = xy[0];
  return (
    <section>
      <h4 className="mb-2 text-xs font-medium text-ink-2">{label}</h4>
      <svg viewBox={`0 0 ${S} ${S}`} className="h-40 w-40" role="img" aria-label={label}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={px(sx)} cy={py(sy)} r={4} fill="var(--good)" stroke="var(--surface)" strokeWidth={2} />
      </svg>
    </section>
  );
}
