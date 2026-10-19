// Single-activity files: GPX, TCX and (in fit.ts) FIT. Every watch brand and
// Strava's archive can export at least one of them.
import type { RunSource } from "../types";
import type { RawActivity } from "./common";
import { looksLikeRun, summarize, type Sample } from "./samples";

/** Values of every <prefix:tag> element, ignoring namespace prefixes. */
function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}

const tagValue = (xml: string, tag: string) => tagValues(xml, tag)[0];

const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

/** Blocks of <prefix:tag ...>...</prefix:tag>, with their attributes. */
function blocks(xml: string, tag: string): { attrs: string; body: string }[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>)`, "g");
  return [...xml.matchAll(re)].map((m) => ({ attrs: m[1] ?? "", body: m[2] ?? "" }));
}

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Local date and time from a wall-clock string such as "2026-10-12T07:00:00" or "2026-10-12 07:00:00". */
export function wallClock(value: string): { date: string; time: string } | undefined {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : undefined;
}

/** Epoch ms of a wall-clock string at a UTC offset in minutes (east positive). */
export function wallClockMs(value: string, offsetMinutes: number): number {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
  return m ? Date.parse(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}Z`) - offsetMinutes * 60_000 : NaN;
}

/** Local calendar date and clock time of a UTC instant, in the runner's time zone. */
export function localDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Brand from a GPX/TCX creator or FIT manufacturer string. */
export function sourceFromCreator(creator: string | undefined): RunSource {
  const c = (creator ?? "").toLowerCase();
  if (c.includes("garmin")) return "garmin";
  if (c.includes("polar")) return "polar";
  if (c.includes("coros")) return "coros";
  if (c.includes("suunto")) return "suunto";
  if (c.includes("wahoo")) return "wahoo";
  if (c.includes("strava")) return "strava";
  if (c.includes("apple")) return "apple-health";
  return "file";
}

export const RUN_SPORT = /run|lauf|jog|treadmill|trail/i;
// Strava writes its numeric activity type into GPX <type>: 9 is "Run".
const STRAVA_GPX_RUN = "9";

export interface FileActivityMeta {
  source: RunSource;
  /** epoch ms of the first sample */
  start: number;
  /** sport as stated in the file, if any */
  sport?: string;
  name?: string;
  calories?: number;
  indoor?: boolean;
  /** totals the file states itself; preferred over values derived from samples */
  totalDistance?: number;
  totalSeconds?: number;
  avgHr?: number;
  maxHr?: number;
  totalAscent?: number;
  device?: string;
  /** local date and clock time as the source states them; otherwise derived from `start` */
  local?: { date: string; time: string };
  /** stable id; defaults to source and start time */
  id?: string;
}

/** Combines file metadata and samples into one activity, or null if it isn't a run. */
export function toActivity(meta: FileActivityMeta, samples: Sample[]): RawActivity | null {
  const summary = summarize(samples);
  if (!summary && !meta.totalDistance) return null;
  const distance = meta.totalDistance ?? summary?.distance ?? 0;
  const duration = meta.totalSeconds ?? summary?.duration ?? 0;
  if (!(distance > 0) || !(duration > 0)) return null;
  if (meta.sport ? !RUN_SPORT.test(meta.sport) && meta.sport !== STRAVA_GPX_RUN : !looksLikeRun(distance, duration)) return null;

  const { date, time } = meta.local ?? localDateTime(meta.start);
  const details = { ...summary?.details, startTime: time };
  if (meta.totalAscent !== undefined) details.elevationGain = Math.round(meta.totalAscent);
  if (meta.calories) details.calories = Math.round(meta.calories);
  if (meta.device) details.device = meta.device;
  return {
    externalId: meta.id ?? `${meta.source}:${new Date(meta.start).toISOString()}`,
    source: meta.source,
    start: meta.start,
    date,
    distance,
    duration,
    name: meta.name,
    avgHr: meta.avgHr ?? summary?.avgHr,
    maxHr: meta.maxHr ?? summary?.maxHr,
    indoor: meta.indoor || undefined,
    details,
  };
}

export interface TimedPoint {
  ms: number;
  lat?: number;
  lon?: number;
  alt?: number;
  hr?: number;
  cad?: number;
}

/** Track points of a GPX file, with the Garmin TrackPointExtension (hr, cad) when present. */
export function gpxPoints(xml: string): TimedPoint[] {
  return blocks(xml, "trkpt")
    .map((p) => {
      const time = tagValue(p.body, "time");
      const cad = num(tagValue(p.body, "cad"));
      return {
        ms: time ? Date.parse(time) : NaN,
        lat: num(attr(p.attrs, "lat")),
        lon: num(attr(p.attrs, "lon")),
        alt: num(tagValue(p.body, "ele")),
        hr: num(tagValue(p.body, "hr")),
        // GPX cadence counts one foot.
        cad: cad !== undefined ? cad * 2 : undefined,
      };
    })
    .filter((p) => Number.isFinite(p.ms));
}

/** GPX 1.0/1.1 as written by Garmin, Strava, Polar, COROS, Suunto and Apple. */
export function parseGpx(xml: string, fallbackSource?: RunSource): RawActivity | null {
  const creator = attr(xml.slice(0, 2000), "creator");
  const parsed = gpxPoints(xml);
  if (parsed.length < 2) return null;
  const start = parsed[0].ms;
  const trackHeader = xml.slice(xml.search(/<(?:[\w-]+:)?trk\b/), xml.search(/<(?:[\w-]+:)?trkseg\b/));
  return toActivity(
    {
      source: creator ? sourceFromCreator(creator) : (fallbackSource ?? "file"),
      start,
      sport: tagValue(trackHeader, "type"),
      name: tagValue(trackHeader, "name"),
    },
    parsed.map((p) => ({ t: (p.ms - start) / 1000, lat: p.lat, lon: p.lon, alt: p.alt, hr: p.hr, cad: p.cad })),
  );
}

/** Garmin Training Center XML (TCX), as written by Garmin, Strava, Polar and others. */
export function parseTcx(xml: string, fallbackSource?: RunSource): RawActivity | null {
  const activity = blocks(xml, "Activity")[0];
  if (!activity) return null;
  const sport = attr(activity.attrs, "Sport");
  const laps = blocks(activity.body, "Lap");
  const points = blocks(activity.body, "Trackpoint");
  const parsed = points
    .map((p) => {
      const time = tagValue(p.body, "Time");
      // Running cadence lives in the TPX extension; <Cadence> is the bike sensor. Both count one foot.
      const cad = num(tagValue(p.body, "RunCadence")) ?? num(tagValue(p.body, "Cadence"));
      return {
        ms: time ? Date.parse(time) : NaN,
        lat: num(tagValue(p.body, "LatitudeDegrees")),
        lon: num(tagValue(p.body, "LongitudeDegrees")),
        alt: num(tagValue(p.body, "AltitudeMeters")),
        dist: num(tagValue(p.body, "DistanceMeters")),
        hr: num(tagValue(blocks(p.body, "HeartRateBpm")[0]?.body ?? "", "Value")),
        cad: cad !== undefined ? cad * 2 : undefined,
      };
    })
    .filter((p) => Number.isFinite(p.ms));

  const lapTotals = laps.map((l) => ({
    seconds: num(tagValue(l.body.replace(/<(?:[\w-]+:)?Track\b[\s\S]*<\/(?:[\w-]+:)?Track>/, ""), "TotalTimeSeconds")) ?? 0,
    meters: num(tagValue(l.body.replace(/<(?:[\w-]+:)?Track\b[\s\S]*<\/(?:[\w-]+:)?Track>/, ""), "DistanceMeters")) ?? 0,
    calories: num(tagValue(l.body, "Calories")) ?? 0,
    maxHr: num(tagValue(blocks(l.body, "MaximumHeartRateBpm")[0]?.body ?? "", "Value")),
  }));
  const id = tagValue(activity.body, "Id");
  const start = parsed[0]?.ms ?? (id ? Date.parse(id) : NaN);
  if (!Number.isFinite(start)) return null;
  const creatorName = tagValue(blocks(activity.body, "Creator")[0]?.body ?? "", "Name");
  const totalSeconds = lapTotals.reduce((s, l) => s + l.seconds, 0);
  const totalDistance = lapTotals.reduce((s, l) => s + l.meters, 0);
  const lapMax = lapTotals.map((l) => l.maxHr).filter((v): v is number => v !== undefined);
  return toActivity(
    {
      source: creatorName ? sourceFromCreator(creatorName) : (fallbackSource ?? "file"),
      start,
      sport,
      device: creatorName,
      totalSeconds: totalSeconds || undefined,
      totalDistance: totalDistance || undefined,
      calories: lapTotals.reduce((s, l) => s + l.calories, 0) || undefined,
      maxHr: lapMax.length ? Math.max(...lapMax) : undefined,
    },
    parsed.map((p) => ({ t: (p.ms - start) / 1000, lat: p.lat, lon: p.lon, alt: p.alt, dist: p.dist, hr: p.hr, cad: p.cad })),
  );
}
