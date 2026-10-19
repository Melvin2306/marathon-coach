// One entry point for every export: the uploaded files (ZIPs, or single
// files) are streamed entry by entry and each entry is recognised by its path,
// so the runner doesn't have to say where the file came from. Everything runs
// in the browser; nothing is uploaded.
import type { HealthMetrics, RunSource } from "../types";
import { AppleHealthReader, isAppleExportXml, isAppleRoute } from "./apple-health";
import { parseGpx, parseTcx } from "./activity-files";
import { SOURCE_PRIORITY, type RawActivity } from "./common";
import { isZipName, maybeGunzip, readArchive, type EntryHandler, type Router } from "./files";
import { isFit, parseFit } from "./fit";
import { isFitbitExercise, isFitbitHrv, isFitbitRestingHr, parseFitbitExercises, readFitbitHrv, readFitbitRestingHr } from "./fitbit";
import {
  isGarminDaily,
  isGarminHealthStatus,
  isGarminMaxMet,
  isGarminSummaries,
  parseGarminSummaries,
  readGarminDaily,
  readGarminHealthStatus,
  readGarminMaxMet,
} from "./garmin";
import { DailyMetrics } from "./metrics";
import { isOuraHeartRate, isOuraSleep, isOuraVo2max, isOuraWorkouts, OuraHeartRate, parseOuraWorkouts, readOuraSleep, readOuraVo2max } from "./oura";
import { isPolarSession, parsePolarJson, parsePolarSession } from "./polar";
import { isStravaActivityFile, isStravaCsv, mergeStrava, parseStravaCsv, recordingKey } from "./strava-csv";
import { isWhoopCycles, isWhoopWorkouts, parseWhoopWorkouts, readWhoopCycles } from "./whoop";

/** Where an upload came from, as far as the importer can tell. */
export type Provider = "apple-health" | "strava" | "garmin" | "polar" | "oura" | "whoop" | "fitbit" | "file";

export interface ImportResult {
  activities: RawActivity[];
  metrics: HealthMetrics;
  /** daily health values read (resting heart rate, HRV, VO2max) */
  metricDays: number;
  providers: Provider[];
}

export class ImportError extends Error {
  constructor(readonly reason: "unrecognized" | "unreadable") {
    super(reason);
  }
}

/** Shorter "runs" are accidental starts. */
const MIN_DISTANCE = 300;
/** Slower than 20:00 /km on average: a watch left running, not a run. */
const MAX_PACE = 1200;
/** Two files of the same run start within this many seconds of each other. */
const SAME_START = 120;

const ACTIVITY_FILE = /\.(fit|gpx|tcx)(\.gz)?$/i;
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const json = (bytes: Uint8Array) => JSON.parse(decode(bytes).replace(/^﻿/, "")) as unknown;

/** A single FIT, GPX or TCX recording (optionally gzipped). */
export async function parseActivityFile(name: string, raw: Uint8Array, fallback: RunSource = "file"): Promise<RawActivity | null> {
  const { name: plain, bytes } = maybeGunzip(name, raw);
  if (/\.fit$/i.test(plain) || isFit(bytes)) return parseFit(bytes, fallback);
  if (/\.gpx$/i.test(plain)) return parseGpx(decode(bytes), fallback);
  if (/\.tcx$/i.test(plain)) return parseTcx(decode(bytes).trimStart(), fallback);
  return null;
}

const richness = (a: RawActivity) => (a.details?.hrSeries ? 2 : 0) + (a.details?.paceSeries ? 2 : 0) + (a.avgHr ? 1 : 0);

/**
 * The same run can arrive twice in one upload (a Garmin summary and its FIT
 * file, or a watch file next to a Strava archive). Keeps the most detailed
 * copy and fills its gaps from the others.
 */
export function dedupe(activities: RawActivity[]): RawActivity[] {
  const ranked = [...activities].sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source] || richness(b) - richness(a));
  const kept: RawActivity[] = [];
  for (const a of ranked) {
    const same = kept.find(
      (k) =>
        k.externalId === a.externalId ||
        (k.date === a.date &&
          Math.abs(k.distance - a.distance) / Math.max(k.distance, a.distance) <= 0.03 &&
          (k.start === undefined || a.start === undefined || Math.abs(k.start - a.start) <= SAME_START * 1000)),
    );
    if (!same) {
      kept.push({ ...a });
      continue;
    }
    same.name ??= a.name;
    same.rpe ??= a.rpe;
    same.avgHr ??= a.avgHr;
    same.maxHr ??= a.maxHr;
    same.indoor ||= a.indoor;
    // The other copy fills gaps, but its device didn't record this copy.
    same.details = { ...a.details, ...same.details, device: same.details?.device };
  }
  return kept.sort((a, b) => a.date.localeCompare(b.date));
}

/** Reads any mix of supported exports. `since` (ISO date) skips older daily values early to save memory. */
export async function importFiles(
  files: File[],
  { since = "0000-00-00", onProgress }: { since?: string; onProgress?: (fraction: number) => void } = {},
): Promise<ImportResult> {
  const providers = new Set<Provider>();
  const metrics = new DailyMetrics(since);
  const activities: RawActivity[] = [];
  const apple = new AppleHealthReader(since);
  const stravaCsv: string[] = [];
  const stravaFiles = new Map<string, RawActivity>();
  const garminSummaries: RawActivity[] = [];
  const ouraHr = new OuraHeartRate();
  const ouraWorkouts: string[] = [];
  let appleText = false;

  const bytes = (provider: Provider | null, onBytes: (b: Uint8Array, name: string) => void | Promise<void>): EntryHandler => ({
    kind: "bytes",
    onBytes: async (b, name) => {
      try {
        await onBytes(b, name);
        if (provider) providers.add(provider);
      } catch {
        // One unreadable entry shouldn't sink the whole archive.
      }
    },
  });

  const route: Router = (name) => {
    if (isZipName(name)) return { kind: "zip" };
    // The export's main XML, or a bare export.xml uploaded on its own.
    if (isAppleExportXml(name) || (!name.includes("/") && /\.xml$/i.test(name) && !/export_cda\.xml$/i.test(name))) {
      appleText = true;
      return { kind: "text", onText: (chunk) => apple.push(chunk) };
    }
    if (isAppleRoute(name)) return bytes(null, (b, n) => apple.addRoute(n, decode(b)));
    if (isStravaCsv(name)) return bytes("strava", (b) => void stravaCsv.push(decode(b)));
    if (isStravaActivityFile(name)) {
      return bytes("strava", async (b, n) => {
        const activity = await parseActivityFile(n, b, "strava");
        if (activity) stravaFiles.set(recordingKey(n)!, activity);
      });
    }
    if (isGarminSummaries(name)) return bytes("garmin", (b) => void garminSummaries.push(...parseGarminSummaries(json(b))));
    if (isGarminDaily(name)) return bytes("garmin", (b) => readGarminDaily(json(b), metrics));
    if (isGarminHealthStatus(name)) return bytes("garmin", (b) => readGarminHealthStatus(json(b), metrics));
    if (isGarminMaxMet(name)) return bytes("garmin", (b) => readGarminMaxMet(json(b), metrics));
    if (isOuraHeartRate(name)) {
      providers.add("oura");
      return { kind: "text", onText: (chunk) => ouraHr.push(chunk) };
    }
    if (isOuraSleep(name)) return bytes("oura", (b) => readOuraSleep(decode(b), metrics));
    if (isOuraVo2max(name)) return bytes("oura", (b) => readOuraVo2max(decode(b), metrics));
    if (isOuraWorkouts(name)) return bytes("oura", (b) => void ouraWorkouts.push(decode(b)));
    if (isWhoopCycles(name)) return bytes("whoop", (b) => readWhoopCycles(decode(b), metrics));
    if (isWhoopWorkouts(name)) return bytes("whoop", (b) => void activities.push(...parseWhoopWorkouts(decode(b))));
    if (isPolarSession(name)) {
      return bytes("polar", (b) => {
        const activity = parsePolarSession(parsePolarJson(decode(b)));
        if (activity) activities.push(activity);
      });
    }
    if (isFitbitExercise(name)) return bytes("fitbit", (b) => void activities.push(...parseFitbitExercises(json(b))));
    if (isFitbitRestingHr(name)) return bytes("fitbit", (b) => readFitbitRestingHr(json(b), metrics));
    if (isFitbitHrv(name)) return bytes("fitbit", (b) => readFitbitHrv(decode(b), metrics));
    if (ACTIVITY_FILE.test(name)) {
      return bytes(null, async (b, n) => {
        const activity = await parseActivityFile(n, b);
        if (!activity) return;
        activities.push(activity);
        providers.add(activity.source === "garmin" ? "garmin" : activity.source === "polar" ? "polar" : "file");
      });
    }
    return null;
  };

  const total = files.reduce((s, f) => s + f.size, 0) || 1;
  let done = 0;
  for (const file of files) {
    try {
      await readArchive(file, route, (fraction) => onProgress?.((done + fraction * file.size) / total));
    } catch {
      throw new ImportError("unreadable");
    }
    done += file.size;
  }

  if (appleText && apple.sawHealthData) {
    providers.add("apple-health");
    const result = apple.finish();
    activities.push(...result.activities);
    metrics.addAll(result.metrics);
  }
  const usedRecordings = new Set<string>();
  for (const text of stravaCsv) {
    let parsed: ReturnType<typeof parseStravaCsv>;
    try {
      parsed = parseStravaCsv(text);
    } catch {
      continue; // empty file; the recordings below still count
    }
    const { rows, otherFiles } = parsed;
    activities.push(...mergeStrava(rows, stravaFiles, usedRecordings));
    // Rides and the like stay out even if the file says otherwise: the runner's label on Strava wins.
    for (const f of otherFiles) usedRecordings.add(recordingKey(f)!);
  }
  // Recordings the CSV doesn't list (or whose rows it couldn't read) still count; there the file's own sport decides.
  for (const [key, activity] of stravaFiles) if (!usedRecordings.has(key)) activities.push(activity);
  activities.push(...garminSummaries);
  ouraHr.finish();
  for (const text of ouraWorkouts) activities.push(...parseOuraWorkouts(text, ouraHr.samples));

  if (!providers.size) throw new ImportError("unrecognized");
  return {
    activities: dedupe(activities.filter((a) => a.distance >= MIN_DISTANCE && a.duration > 0 && a.duration / (a.distance / 1000) <= MAX_PACE)),
    metrics: metrics.result(),
    metricDays: metrics.size,
    providers: [...providers],
  };
}
