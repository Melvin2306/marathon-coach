import { expect } from "vitest";
import type { RawActivity } from "@/lib/import/common";
import { EXPECTED, POINTS } from "./canonical";

interface Options {
  /** the source records heart rate */
  hr?: boolean;
  /** the source records cadence */
  cadence?: boolean;
  /** the source records a heart-rate curve, not just averages */
  hrSeries?: boolean;
  /** pace and altitude curves */
  route?: boolean;
  /** relative distance tolerance (GPS-derived distance differs slightly) */
  distanceTolerance?: number;
}

/** Asserts that a parsed activity matches the canonical run. */
export function expectCanonical(a: RawActivity | null | undefined, opts: Options = {}) {
  const { hr = true, cadence = true, hrSeries = true, route = true, distanceTolerance = 0.005 } = opts;
  expect(a, "activity parsed").toBeTruthy();
  const run = a!;
  expect(run.date).toBe(EXPECTED.date);
  expect(run.details?.startTime).toBe(EXPECTED.startTime);
  expect(Math.abs(run.distance - EXPECTED.distance) / EXPECTED.distance).toBeLessThan(distanceTolerance);
  expect(Math.abs(run.duration - EXPECTED.duration)).toBeLessThanOrEqual(2);
  if (hr) {
    expect(Math.abs((run.avgHr ?? 0) - EXPECTED.avgHr)).toBeLessThanOrEqual(1);
    expect(run.maxHr).toBe(EXPECTED.maxHr);
  }
  if (cadence) expect(Math.abs((run.details?.cadence ?? 0) - EXPECTED.cadence)).toBeLessThanOrEqual(1);
  if (hrSeries) {
    const series = run.details?.hrSeries ?? [];
    expect(series.length).toBe(Math.ceil((POINTS.length) / 30));
    // First bucket averages the first 30 seconds of the warm-up.
    const firstBucket = POINTS.slice(0, 30).reduce((s, p) => s + p.hr, 0) / 30;
    expect(Math.abs(series[0] - firstBucket)).toBeLessThanOrEqual(1);
  }
  if (route) {
    const pace = (run.details?.paceSeries ?? []).filter((v) => v > 0);
    expect(pace.length).toBeGreaterThan(90);
    const median = [...pace].sort((x, y) => x - y)[Math.floor(pace.length / 2)];
    expect(Math.abs(median - EXPECTED.avgPace)).toBeLessThan(8);
    expect(Math.abs((run.details?.elevationGain ?? 0) - EXPECTED.elevationGain)).toBeLessThan(10);
    expect((run.details?.altitudeSeries ?? []).length).toBeGreaterThan(90);
  }
}
