// Every supported export, end to end through importFiles(): archive layout,
// file detection, parsing, and the same canonical run coming out of each.
import { gzipSync, strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { dedupe, importFiles, ImportError, type ImportResult } from "@/lib/import/importer";
import { parseStravaDate } from "@/lib/import/strava-csv";
import { EXPECTED } from "../fixtures/canonical";
import { expectCanonical } from "../fixtures/expect-canonical";
import {
  appleExportXml,
  appleExportZip,
  file,
  fitbitTakeout,
  garminExport,
  ouraExport,
  polarExport,
  polarSessionA,
  stravaArchive,
  stravaCsv,
  whoopExport,
  zip,
} from "../fixtures/exports";
import { fitActivity } from "../fixtures/fit";
import { gpx, tcx } from "../fixtures/writers";

const onDay = (r: ImportResult, date: string) => r.activities.filter((a) => a.date === date);
const metric = (r: ImportResult, kind: keyof ImportResult["metrics"], date = EXPECTED.date) => r.metrics[kind]?.find(([d]) => d === date)?.[1];

describe("Apple Health", () => {
  it("export.zip: workout totals, watch heart rate, route curves and daily values", async () => {
    const result = await importFiles([appleExportZip()]);
    expect(result.providers).toEqual(["apple-health"]);
    expect(result.activities).toHaveLength(1); // the ride is skipped
    const run = result.activities[0];
    expectCanonical(run, { distanceTolerance: 0.001 });
    expect(run.source).toBe("apple-health");
    expect(run.details).toMatchObject({ calories: 702, power: 245, elevationGain: 100, temperature: 12, humidity: 65 });
    // The iPhone's 60 bpm sample must not leak into the watch's curve.
    expect(Math.min(...run.details!.hrSeries!.filter(Boolean))).toBeGreaterThan(110);
    expect(metric(result, "restingHr")).toBe(48);
    expect(metric(result, "hrv")).toBe(62);
    expect(metric(result, "vo2max")).toBe(51.3);
  });

  it("finds a localized main XML (e.g. Chinese iPhones write 导出.xml)", async () => {
    const result = await importFiles([appleExportZip({ xmlName: "导出.xml" })]);
    expect(result.activities).toHaveLength(1);
  });

  it("accepts the bare export.xml (no route: totals and heart rate only)", async () => {
    const result = await importFiles([file("export.xml", appleExportXml())]);
    expectCanonical(result.activities[0], { distanceTolerance: 0.001, route: false });
  });

  it("streams large exports in small chunks without losing workouts", async () => {
    // 1-second heart rate makes the XML ~0.5 MB; the reader gets it in 64 KB pieces.
    const result = await importFiles([file("export.xml", appleExportXml({ hrEvery: 1 }))]);
    expectCanonical(result.activities[0], { distanceTolerance: 0.001, route: false });
  });
});

describe("Strava archive", () => {
  it("uses the original FIT recording and keeps Strava's id, name and effort", async () => {
    const result = await importFiles([stravaArchive()]);
    expect(result.providers).toContain("strava");
    const [run] = onDay(result, EXPECTED.date);
    expectCanonical(run);
    expect(run.externalId).toBe("strava:1001");
    expect(run.name).toBe("Sunday long run, felt strong");
    expect(run.rpe).toBe(6);
    expect(run.details?.stravaId).toBe(1001);
  });

  it("reads gzipped GPX recordings too", async () => {
    const [run] = onDay(await importFiles([stravaArchive({ recording: "gpx" })]), EXPECTED.date);
    expectCanonical(run, { distanceTolerance: 0.01 });
    expect(run.externalId).toBe("strava:1001");
  });

  it("falls back to the CSV values when a run has no recording", async () => {
    const result = await importFiles([stravaArchive({ recording: "none" })]);
    const [run] = onDay(result, EXPECTED.date);
    expectCanonical(run, { hrSeries: false, route: false });
    expect(run.details?.elevationGain).toBe(100);
    // Rides are skipped; the treadmill run without a file is kept.
    expect(result.activities).toHaveLength(2);
  });

  it("Activity Date is UTC: a late-evening run lands on the local day", async () => {
    const result = await importFiles([stravaArchive({ recording: "none" })]);
    // "Oct 14, 2026, 10:30:00 PM" UTC is 00:30 on Oct 15 in Berlin.
    expect(result.activities.find((a) => a.externalId === "strava:1003")).toMatchObject({ date: "2026-10-15", avgHr: 150, maxHr: 165 });
  });

  it("localized headers: core columns are found by position", async () => {
    const csv = stravaCsv({ recording: "none" });
    const [header, ...rows] = csv.split("\n");
    const localized = header.split(",").map((_, i) => `Spalte ${i}`).join(",");
    const result = await importFiles([file("activities.csv", [localized, ...rows].join("\n"))]);
    expect(onDay(result, EXPECTED.date)[0]).toMatchObject({ externalId: "strava:1001", duration: EXPECTED.duration, name: "Sunday long run, felt strong" });
    expect(Math.abs(onDay(result, EXPECTED.date)[0].distance - EXPECTED.distance)).toBeLessThan(10);
  });

  it("parses English and German dates", () => {
    expect(parseStravaDate("Oct 12, 2026, 5:00:00 AM")).toBe(Date.UTC(2026, 9, 12, 5));
    expect(parseStravaDate("Oct 12, 2026, 5:00:00 PM")).toBe(Date.UTC(2026, 9, 12, 17));
    expect(parseStravaDate("Oct 12, 2026, 12:10:00 AM")).toBe(Date.UTC(2026, 9, 12, 0, 10));
    expect(parseStravaDate("12. Okt. 2026, 05:00:00")).toBe(Date.UTC(2026, 9, 12, 5));
    expect(parseStravaDate("2026-10-12 05:00:00")).toBe(Date.UTC(2026, 9, 12, 5));
  });

  it("accepts the bare activities.csv, also in a German account", async () => {
    const result = await importFiles([file("activities.csv", stravaCsv({ recording: "none", date: "12. Okt. 2026, 05:00:00" }))]);
    expectCanonical(onDay(result, EXPECTED.date)[0], { hrSeries: false, route: false });
  });
});

describe("Garmin Connect export", () => {
  it("reads FIT files from the nested upload ZIPs, names from the summaries, and wellness data", async () => {
    const result = await importFiles([garminExport()]);
    expect(result.providers).toEqual(["garmin"]);
    const [run] = onDay(result, EXPECTED.date);
    expectCanonical(run);
    expect(run.name).toBe("Berlin Running");
    // The treadmill run has only a summary; the ride and the monitoring file are skipped.
    expect(result.activities).toHaveLength(2);
    expect(result.activities[1]).toMatchObject({ date: "2026-10-13", distance: 5000, duration: 1800, indoor: true, avgHr: 140 });
    expect(metric(result, "restingHr")).toBe(47);
    expect(metric(result, "hrvRmssd")).toBe(58);
    expect(metric(result, "vo2max")).toBe(52);
  });
});

describe("Polar Flow export", () => {
  it("newer layout: interval samples and route", async () => {
    const result = await importFiles([polarExport()]);
    expect(result.providers).toEqual(["polar"]);
    const run = result.activities[0];
    expectCanonical(run, { distanceTolerance: 0.001 });
    expect(run.details?.device).toBe("Polar Vantage V3");
  });

  it("older layout (exportVersion 2.x): timestamped samples", async () => {
    const result = await importFiles([file("training-session-2026-10-12-1-a.json", polarSessionA())]);
    expectCanonical(result.activities[0], { distanceTolerance: 0.001 });
    expect(result.activities[0].details?.calories).toBe(702);
  });
});

describe("Oura export", () => {
  it("sleep: lowest heart rate and HRV of the main sleep, short rows included", async () => {
    const result = await importFiles([ouraExport()]);
    expect(result.providers).toEqual(["oura"]);
    expect(metric(result, "restingHr")).toBe(46);
    expect(metric(result, "hrvRmssd")).toBe(61);
    expect(metric(result, "restingHr", "2026-10-13")).toBe(48);
    expect(metric(result, "vo2max")).toBe(49);
  });

  it("running workouts get heart rate from the workout samples", async () => {
    const result = await importFiles([ouraExport()]);
    expect(result.activities).toHaveLength(1);
    expectCanonical(result.activities[0], { cadence: false, route: false, distanceTolerance: 0.001 });
  });
});

describe("WHOOP export", () => {
  it("runs with averages; recovery values", async () => {
    const result = await importFiles([whoopExport()]);
    expect(result.providers).toEqual(["whoop"]);
    expect(result.activities).toHaveLength(1);
    expectCanonical(result.activities[0], { cadence: false, hrSeries: false, route: false });
    expect(result.activities[0].details).toMatchObject({ calories: 702, elevationGain: 100 });
    expect(metric(result, "restingHr")).toBe(49);
    expect(metric(result, "hrvRmssd")).toBe(72);
  });
});

describe("Fitbit (Google Takeout)", () => {
  it("runs from exercise logs, resting heart rate and HRV", async () => {
    const result = await importFiles([fitbitTakeout()]);
    expect(result.providers).toEqual(["fitbit"]);
    expect(result.activities).toHaveLength(1); // the walk and the accidental "runs" are skipped
    const run = result.activities[0];
    // Fitbit logs no max heart rate.
    expectCanonical(run, { hr: false, hrSeries: false, route: false, distanceTolerance: 0.001 });
    expect(run.avgHr).toBe(EXPECTED.avgHr);
    expect(metric(result, "restingHr")).toBe(51.4);
    expect(metric(result, "restingHr", "2026-10-13")).toBeUndefined();
    expect(metric(result, "hrvRmssd")).toBe(44.2);
  });
});

describe("single activity files (COROS, Suunto, Wahoo, any watch)", () => {
  it("FIT, GPX, TCX and gzipped files, loose or zipped together", async () => {
    for (const f of [
      file("Run.fit", fitActivity({ manufacturer: "coros" })),
      file("Run.gpx", gpx()),
      file("Run.tcx", tcx()),
      zip("activities.zip", { "a.fit": fitActivity({ manufacturer: "suunto" }) }),
    ]) {
      const result = await importFiles([f]);
      expect(result.activities, f.name).toHaveLength(1);
      expectCanonical(result.activities[0], { distanceTolerance: 0.01 });
    }
  });

  it("several files at once", async () => {
    const result = await importFiles([whoopExport(), ouraExport()]);
    expect(new Set(result.providers)).toEqual(new Set(["whoop", "oura"]));
  });
});

describe("parity across providers", () => {
  it("every source reports the same run the same way", async () => {
    const runs = await Promise.all(
      [appleExportZip(), stravaArchive(), garminExport(), polarExport(), ouraExport(), whoopExport(), fitbitTakeout()].map(async (f) => onDay(await importFiles([f]), EXPECTED.date)[0]),
    );
    for (const run of runs) {
      expect(run.date).toBe(EXPECTED.date);
      expect(run.details?.startTime).toBe(EXPECTED.startTime);
      expect(Math.abs(run.distance - EXPECTED.distance)).toBeLessThan(EXPECTED.distance * 0.01);
      expect(Math.abs(run.duration - EXPECTED.duration)).toBeLessThanOrEqual(2);
      expect(Math.abs((run.avgHr ?? 0) - EXPECTED.avgHr)).toBeLessThanOrEqual(1);
    }
  });

  it("the same run in two exports is imported once, keeping the richer copy", async () => {
    const result = await importFiles([whoopExport(), garminExport()]);
    const runs = onDay(result, EXPECTED.date);
    expect(runs).toHaveLength(1);
    expect(runs[0].source).toBe("garmin");
    expect(runs[0].details?.hrSeries).toBeTruthy();
  });

  it("dedupe fills gaps from the other copy", () => {
    const base = { date: EXPECTED.date, distance: 10_000, duration: 3000, start: 0 };
    const [kept] = dedupe([
      { ...base, externalId: "whoop:1", source: "whoop", name: "Morning run", avgHr: 150 },
      { ...base, externalId: "garmin:1", source: "garmin", details: { hrSeries: [150] } },
    ]);
    expect(kept).toMatchObject({ source: "garmin", name: "Morning run", avgHr: 150 });
  });
});

describe("unrecognised uploads", () => {
  it("rejects files that aren't any known export", async () => {
    await expect(importFiles([file("notes.txt", "hello")])).rejects.toBeInstanceOf(ImportError);
    await expect(importFiles([zip("photos.zip", { "a.jpg": strToU8("x") })])).rejects.toMatchObject({ reason: "unrecognized" });
    await expect(importFiles([file("other.xml", "<root/>")])).rejects.toMatchObject({ reason: "unrecognized" });
  });

  it("reports a corrupt ZIP as unreadable", async () => {
    const broken = zipSync({ "export.xml": strToU8(appleExportXml()) }).slice(0, 2000);
    await expect(importFiles([file("export.zip", broken)])).rejects.toMatchObject({ reason: "unreadable" });
  });
});

describe("review regressions", () => {
  const csvWith = (edit: (cells: string[]) => void) => {
    const [header, ...rows] = stravaCsv().split("\n");
    // Split on commas outside quotes.
    const split = (line: string) => line.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ""));
    const first = split(rows[0]);
    edit(first);
    return [header, first.join(","), ...rows.slice(1)].join("\n");
  };
  const archiveWith = (csv: string, extra: Record<string, Uint8Array> = {}) =>
    zip("export_1.zip", { "activities.csv": strToU8(csv), activities: { "111.fit.gz": gzipSync(fitActivity()), ...extra } });

  it("Strava dates in other account languages", () => {
    const expected = Date.UTC(2026, 9, 12, 5);
    expect(parseStravaDate("12 oct 2026, 5:00:00")).toBe(expected); // es / fr
    expect(parseStravaDate("12 de oct. de 2026, 5:00:00")).toBe(expected); // es (long)
    expect(parseStravaDate("12 ott 2026, 05:00:00")).toBe(expected); // it
    expect(parseStravaDate("12 de out. de 2026 05:00:00")).toBe(expected); // pt
    expect(parseStravaDate("12 okt. 2026 05:00:00")).toBe(expected); // nl
    expect(parseStravaDate("12 janv. 2026 05:00:00")).toBe(Date.UTC(2026, 0, 12, 5)); // fr
    expect(parseStravaDate("12 dic 2026, 5:00:00")).toBe(Date.UTC(2026, 11, 12, 5)); // es / it
    expect(parseStravaDate("2026-10-12")).toBe(Date.UTC(2026, 9, 12));
  });

  it("a Strava row whose date can't be read still imports its recording", async () => {
    const result = await importFiles([archiveWith(csvWith((c) => (c[1] = '"unreadable"')))]);
    expectCanonical(onDay(result, EXPECTED.date)[0]);
  });

  it("recordings the CSV doesn't list are imported; recordings of rides are not", async () => {
    const result = await importFiles([archiveWith(csvWith((c) => (c[12] = "")), { "112.fit.gz": gzipSync(fitActivity()) })]);
    // 111 and 112 are the same run, so they merge into one; the ride row (112 in the CSV) excludes 112.
    expect(onDay(result, EXPECTED.date)).toHaveLength(1);
    const rideOnly = await importFiles([zip("e.zip", { "activities.csv": strToU8(csvWith((c) => (c[3] = "Ride"))), activities: { "111.fit.gz": gzipSync(fitActivity()) } })]);
    expect(onDay(rideOnly, EXPECTED.date)).toHaveLength(0);
  });

  it("keeps Strava's corrected elevation over the recording's", async () => {
    const [run] = onDay(await importFiles([archiveWith(csvWith((c) => (c[20] = "123.0")))]), EXPECTED.date);
    expect(run.details?.elevationGain).toBe(123);
    expect(run.details?.altitudeSeries?.length).toBeGreaterThan(90);
  });

  it("a row with only the metres column filled", async () => {
    const result = await importFiles([file("activities.csv", csvWith((c) => (c[6] = "")).replace(/activities\/111\.fit\.gz/, ""))]);
    expect(Math.abs(onDay(result, EXPECTED.date)[0].distance - EXPECTED.distance)).toBeLessThan(1);
  });

  it("XML files in other archives aren't treated as Apple Health", async () => {
    const result = await importFiles([zip("watch.zip", { "settings/device.xml": strToU8("<Workout x>"), "run.fit": fitActivity() })]);
    expect(result.providers).toEqual(["garmin"]);
    expect(result.activities).toHaveLength(1);
  });

  it("Apple workouts and routes before the start date are skipped", async () => {
    const result = await importFiles([appleExportZip()], { since: "2026-10-13" });
    expect(result.activities).toHaveLength(0);
  });
});
