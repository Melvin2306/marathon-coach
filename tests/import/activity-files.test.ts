import { describe, expect, it } from "vitest";
import { parseGpx, parseTcx } from "@/lib/import/activity-files";
import { elevationGain, smoothAltitudes, summarize } from "@/lib/import/samples";
import { expectCanonical } from "../fixtures/expect-canonical";
import { appleRouteGpx, gpx, tcx } from "../fixtures/writers";

describe("GPX", () => {
  it("Garmin Connect GPX: full parity with the canonical run", () => {
    const run = parseGpx(gpx());
    expectCanonical(run, { distanceTolerance: 0.01 });
    expect(run?.source).toBe("garmin");
  });

  it("Strava GPX (ns3 prefix, numeric type 9 = Run)", () => {
    const run = parseGpx(gpx({ creator: "StravaGPX", type: "9", prefix: "ns3" }));
    expectCanonical(run, { distanceTolerance: 0.01 });
    expect(run?.source).toBe("strava");
  });

  it("sparse GPX (every 5 s, as some apps record) still matches", () => {
    expectCanonical(parseGpx(gpx({ step: 5 })), { distanceTolerance: 0.01, hrSeries: false });
  });

  it("rejects non-running sports", () => {
    expect(parseGpx(gpx({ type: "cycling" }))).toBeNull();
    expect(parseGpx(gpx({ creator: "StravaGPX", type: "1" }))).toBeNull();
  });

  it("route without heart rate (Apple Health workout route)", () => {
    const run = parseGpx(appleRouteGpx());
    expectCanonical(run, { hr: false, cadence: false, hrSeries: false, distanceTolerance: 0.01 });
  });
});

describe("TCX", () => {
  it("Garmin TCX: lap totals and trackpoints", () => {
    const run = parseTcx(tcx());
    expectCanonical(run);
    expect(run?.details?.calories).toBe(702);
    expect(run?.details?.device).toBe("Forerunner 965");
  });

  it("rejects TCX for other sports", () => {
    expect(parseTcx(tcx().replace('Sport="Running"', 'Sport="Biking"'))).toBeNull();
  });
});

describe("summarizer", () => {
  it("hysteresis counts real climbs only", () => {
    expect(elevationGain([10, 20, 15, 30])).toBe(25);
    expect(elevationGain([50, 51, 50, 51.5, 50])).toBe(0);
  });

  it("GPS altitude jitter doesn't add up to fake climbing", () => {
    // ±1.5 m jitter around a flat 50 m, plus ±4 m random spikes.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    const samples = Array.from({ length: 1800 }, (_, t) => ({ t, dist: t * 3.3, alt: 50 + (t % 2 ? 1.5 : -1.5) + rnd() * 8 }));
    expect(summarize(samples)?.details.elevationGain).toBeLessThan(15);
    expect(smoothAltitudes([{ t: 0, alt: 0 }, { t: 1, alt: 10 }, { t: 100, alt: 5 }])[0]).toBe(5);
  });

  it("removes pauses from moving time", () => {
    const s = summarize([
      { t: 0, dist: 0 },
      { t: 600, dist: 2000 },
      { t: 601, dist: 2003 },
      { t: 1200, dist: 4000 },
    ]);
    // Both 599–600 s gaps are pauses; only the 1 s step counts as moving.
    expect(s?.duration).toBe(1);
    expect(s?.elapsed).toBe(1200);
  });

  it("a corrupt timestamp doesn't blow up the series", () => {
    const samples = Array.from({ length: 600 }, (_, t) => ({ t, dist: t * 3, hr: 150 }));
    const run = summarize([...samples, { t: 4_294_967_295, hr: 150 }]);
    expect(run?.details.hrSeries).toHaveLength(20);
  });

  it("series stay aligned to the start when the first sample comes late", () => {
    const samples = Array.from({ length: 3601 }, (_, i) => ({ t: 300 + i, dist: i * 3, hr: i < 3300 ? 140 : 180 }));
    const series = summarize(samples)!.details.hrSeries!;
    expect(series).toHaveLength(131);
    expect(series[0]).toBe(0);
    expect(series.slice(-10).every((v) => v === 180)).toBe(true);
  });
});
