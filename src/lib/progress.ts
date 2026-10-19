// Time series for the Progress page, built from recorded runs and daily health metrics.
import { addDays, daysBetween, mondayOf } from "./dates";
import { timeInZones, ZONES } from "./heart";
import type { DailyValue, Run } from "./types";
import { vdotFromHeartRate } from "./vdot";

const EPOCH = "2000-01-01";
/** Dates become day numbers so charts can use a linear x axis. */
export const dayNumber = (iso: string) => daysBetween(EPOCH, iso);
export const dayToISO = (n: number) => addDays(EPOCH, n);

export interface Point {
  x: number;
  y: number;
}

/** Median of the values within `windowDays` up to and including each point. */
export function rollingMedian(points: Point[], windowDays: number): Point[] {
  return points.map((p) => {
    const values = points.filter((q) => q.x <= p.x && q.x > p.x - windowDays).map((q) => q.y).sort((a, b) => a - b);
    return { x: p.x, y: values[Math.floor(values.length / 2)] };
  });
}

export function rollingMean(points: Point[], windowDays: number): Point[] {
  return points.map((p) => {
    const values = points.filter((q) => q.x <= p.x && q.x > p.x - windowDays).map((q) => q.y);
    return { x: p.x, y: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 };
  });
}

/** Per-run fitness (VDOT) estimated from pace and heart rate. */
export function fitnessPoints(runs: Run[], maxHr: number): (Point & { run: Run })[] {
  return runs.flatMap((r) => {
    if (!r.source || r.source === "manual" || r.indoor || !r.avgHr || r.distance < 3000 || r.duration < 15 * 60) return [];
    const v = vdotFromHeartRate(r.distance, r.duration, r.avgHr, maxHr);
    return v ? [{ x: dayNumber(r.date), y: Math.round(v * 10) / 10, run: r }] : [];
  });
}

export interface ZoneWeek {
  start: string;
  /** minutes per zone */
  minutes: number[];
  /** some runs only had an average heart rate */
  estimated: boolean;
}

export function weeklyZones(runs: Run[], maxHr: number, today: string, weeks: number): ZoneWeek[] {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(first, 7 * i);
    const end = addDays(start, 7);
    const minutes = ZONES.map(() => 0);
    let estimated = false;
    for (const r of runs) {
      if (r.date < start || r.date >= end) continue;
      const z = timeInZones(r, maxHr);
      if (!z) continue;
      z.seconds.forEach((s, k) => (minutes[k] += s / 60));
      estimated ||= z.estimated;
    }
    return { start, minutes: minutes.map(Math.round), estimated };
  });
}

/** Share of zone time spent in recovery + easy, the pyramidal "mostly easy" check. */
export function easyShare(weeks: ZoneWeek[]): number | null {
  const total = weeks.reduce((s, w) => s + w.minutes.reduce((a, b) => a + b, 0), 0);
  if (!total) return null;
  return weeks.reduce((s, w) => s + w.minutes[0] + w.minutes[1], 0) / total;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function dailyPoints(values: DailyValue[] | undefined, today: string, days: number): Point[] {
  const from = addDays(today, -days);
  return (values ?? []).filter(([d]) => d >= from && d <= today).map(([d, v]) => ({ x: dayNumber(d), y: v }));
}
