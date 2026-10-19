// Time series for the Progress page, built from recorded runs and daily health metrics.
import { addDays, daysBetween, mondayOf } from "./dates";
import { timeInZones, ZONES } from "./heart";
import type { DailyValue, Plan, Run } from "./types";
import { HALF, MARATHON, paceAtHeartRate, predictTime, realisticMarathon, vdotFromHeartRate } from "./vdot";

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

const DAY = 1;
const sumMeters = (runs: Run[], from: string, to: string) => runs.filter((r) => r.date >= from && r.date < to).reduce((s, r) => s + r.distance, 0);

export interface RaceTrendPoint {
  x: number;
  /** Vickers & Vertosick realistic time at that week's fitness and mileage */
  realistic: number;
  /** VDOT marathon equivalent: what the fitness allows when fully marathon-trained */
  potential: number;
}

/**
 * Week by week: fitness = median per-run estimate of the trailing 4 weeks,
 * mileage = average of the trailing 4 weeks.
 */
export function raceTrend(runs: Run[], estimates: Point[], today: string, weeks: number): RaceTrendPoint[] {
  const thisMonday = mondayOf(today);
  const points: RaceTrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(thisMonday, 7 - 7 * i);
    const windowEnd = end > today ? addDays(today, DAY) : end;
    const from = addDays(windowEnd, -28);
    const inWindow = estimates.filter((p) => p.x >= dayNumber(from) && p.x < dayNumber(windowEnd)).map((p) => p.y);
    if (inWindow.length < 2) continue;
    const vdot = median(inWindow)!;
    const weekly = sumMeters(runs, from, windowEnd) / 4;
    points.push({
      x: dayNumber(addDays(windowEnd, -1)),
      realistic: realisticMarathon(HALF, predictTime(vdot, HALF), weekly),
      potential: predictTime(vdot, MARATHON),
    });
  }
  return points;
}

/** Where the plan leads: target fitness at the planned mileage of the last 4 weeks before the taper. */
export function raceDayProjection(plan: Plan): { x: number; realistic: number; potential: number } | null {
  const build = plan.weeks.filter((w) => w.phase !== "taper").slice(-4);
  const last = plan.weeks.at(-1);
  if (!build.length || !last) return null;
  const weekly = build.reduce((s, w) => s + w.volume, 0) / build.length;
  const raceDay = last.workouts.find((w) => w.type === "race")?.date ?? addDays(last.start, 6);
  return {
    x: dayNumber(raceDay),
    realistic: realisticMarathon(HALF, predictTime(plan.targetVdot, HALF), weekly),
    potential: predictTime(plan.targetVdot, MARATHON),
  };
}

/** A fixed easy heart rate to compare runs at: 75% of max, rounded to 5 bpm. */
export const referenceHr = (maxHr: number) => Math.round((maxHr * 0.75) / 5) * 5;

/** Each run's pace at the reference heart rate, from its fitness estimate. */
export function paceAtReference(estimates: Point[], hr: number, maxHr: number): Point[] {
  return estimates.map((p) => ({ x: p.x, y: Math.round(paceAtHeartRate(p.y, hr, maxHr)) }));
}

export interface DayTotal {
  meters: number;
  runs: number;
}

export function dailyTotals(runs: Run[]): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>();
  for (const r of runs) {
    const d = map.get(r.date) ?? { meters: 0, runs: 0 };
    map.set(r.date, { meters: d.meters + r.distance, runs: d.runs + 1 });
  }
  return map;
}

/** Weeks (Monday-based) with at least one run, counted back from this week (or last week if this one is still empty). */
export function weekStreak(days: Map<string, DayTotal>, today: string): number {
  const hasRun = (monday: string) => Array.from({ length: 7 }, (_, d) => addDays(monday, d)).some((d) => days.has(d));
  let monday = mondayOf(today);
  if (!hasRun(monday)) monday = addDays(monday, -7);
  let streak = 0;
  while (hasRun(monday)) {
    streak++;
    monday = addDays(monday, -7);
  }
  return streak;
}
