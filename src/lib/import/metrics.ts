// Collects daily health values from any number of files; several readings
// for the same day (e.g. two devices) are averaged.
import type { DailyValue, HealthMetrics } from "../types";

export type MetricKind = "restingHr" | "hrv" | "hrvRmssd" | "vo2max";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class DailyMetrics {
  private values: Record<MetricKind, Map<string, number[]>> = { restingHr: new Map(), hrv: new Map(), hrvRmssd: new Map(), vo2max: new Map() };

  constructor(private since = "0000-00-00") {}

  add(kind: MetricKind, date: string | undefined, value: number | undefined) {
    if (!date || !ISO_DAY.test(date) || date < this.since || value === undefined || !(value > 0)) return;
    const map = this.values[kind];
    map.set(date, [...(map.get(date) ?? []), value]);
  }

  addAll(metrics: HealthMetrics) {
    for (const kind of ["restingHr", "hrv", "hrvRmssd", "vo2max"] as const) for (const [d, v] of metrics[kind] ?? []) this.add(kind, d, v);
  }

  /** number of daily values collected */
  get size() {
    return Object.values(this.values).reduce((n, m) => n + m.size, 0);
  }

  result(): HealthMetrics {
    const daily = (map: Map<string, number[]>): DailyValue[] =>
      [...map.entries()].map(([d, v]) => [d, Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10] as DailyValue).sort((a, b) => a[0].localeCompare(b[0]));
    return { restingHr: daily(this.values.restingHr), hrv: daily(this.values.hrv), hrvRmssd: daily(this.values.hrvRmssd), vo2max: daily(this.values.vo2max) };
  }
}
