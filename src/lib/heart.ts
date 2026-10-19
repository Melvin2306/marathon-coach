// Heart-rate zones matched to the app's training paces, using Daniels' heart
// rate anchors: easy 65–79% of max, marathon 80–87%, threshold 88–92%,
// intervals 93% and up. Below 65% counts as recovery.
import { SERIES_STEP, type Run } from "./types";

export const ZONES = ["recovery", "easy", "marathon", "threshold", "interval"] as const;
export type Zone = (typeof ZONES)[number];

/** Lower bound of each zone as a fraction of max heart rate. */
const LOWER = [0, 0.65, 0.8, 0.88, 0.93];

export function zoneOf(bpm: number, maxHr: number): number {
  const f = bpm / maxHr;
  let z = 0;
  for (let i = 1; i < LOWER.length; i++) if (f >= LOWER[i]) z = i;
  return z;
}

/** [from, to] bpm for each zone. */
export function zoneRanges(maxHr: number): [number, number][] {
  return LOWER.map((l, i) => [Math.round(l * maxHr), i < LOWER.length - 1 ? Math.round(LOWER[i + 1] * maxHr) - 1 : maxHr]);
}

/**
 * Seconds spent in each zone. Uses the recorded heart-rate series when there
 * is one; otherwise the whole run counts toward the zone of its average
 * heart rate (`estimated: true`).
 */
export function timeInZones(run: Run, maxHr: number): { seconds: number[]; estimated: boolean } | null {
  const seconds = ZONES.map(() => 0);
  const series = run.details?.hrSeries;
  if (series?.some((v) => v > 0)) {
    for (const bpm of series) if (bpm > 0) seconds[zoneOf(bpm, maxHr)] += SERIES_STEP;
    return { seconds, estimated: false };
  }
  if (!run.avgHr) return null;
  seconds[zoneOf(run.avgHr, maxHr)] = run.duration;
  return { seconds, estimated: true };
}
