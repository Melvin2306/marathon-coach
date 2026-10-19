// Polar Flow account export (account.polar.com → Download your data): one
// training-session-*.json per session. Two layouts are in circulation: the
// older one with timestamped samples (exportVersion 2.x) and a newer one with
// fixed-interval sample arrays. Both carry the full heart-rate, distance and
// GPS recording, so Polar runs get the same curves as FIT files.
import { RUN_SPORT, toActivity, wallClock, wallClockMs } from "./activity-files";
import type { RawActivity } from "./common";
import type { Sample } from "./samples";

export const isPolarSession = (name: string) => /(^|\/)training-session[^/]*\.json$/i.test(name);

/** Polar writes bare NaN, which isn't valid JSON. */
export const parsePolarJson = (text: string): unknown => JSON.parse(text.replace(/\bNaN\b/g, "null"));

/** "PT3000.5S" or "PT1H2M3S" → seconds */
function isoDuration(value: unknown): number | undefined {
  const m = typeof value === "string" ? value.match(/^PT(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/) : null;
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : undefined;
}

const positive = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Merges values into samples keyed by whole second. */
class SampleGrid {
  private byT = new Map<number, Sample>();
  set(t: number, values: Partial<Sample>) {
    if (!Number.isFinite(t) || t < 0) return;
    const key = Math.round(t);
    const s = this.byT.get(key) ?? { t: key };
    for (const [k, v] of Object.entries(values)) if (typeof v === "number" && Number.isFinite(v)) (s as unknown as Record<string, number>)[k] = v;
    this.byT.set(key, s);
  }
  get samples(): Sample[] {
    return [...this.byT.values()].sort((a, b) => a.t - b.t);
  }
}

export function parsePolarSession(json: unknown): RawActivity | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Json;
  const exercise: Json = s.exercises?.[0] ?? {};
  const startText: string | undefined = s.startTime ?? exercise.startTime;
  if (!startText) return null;
  const offset = Number(s.timeZoneOffset ?? s.timezoneOffsetMinutes ?? exercise.timezoneOffset ?? exercise.timezoneOffsetMinutes ?? 0);
  const start = wallClockMs(startText, offset);
  const grid = new SampleGrid();

  // Newer layout: sport id "1" is running; the session name is the sport's name.
  const sportId = s.sport?.id ?? exercise.sport?.id;
  const sport = typeof exercise.sport === "string" ? exercise.sport : sportId === "1" ? "running" : (s.name ?? "");
  let avgHr: number | undefined;
  let maxHr: number | undefined;

  if (Array.isArray(exercise.samples?.samples)) {
    const exStart = wallClockMs(exercise.startTime ?? startText, offset);
    const lead = (exStart - start) / 1000 || 0;
    const key: Record<string, keyof Sample> = { HEART_RATE: "hr", DISTANCE: "dist", ALTITUDE: "alt", CADENCE: "cad" };
    for (const series of exercise.samples.samples as Json[]) {
      const field = key[series.type];
      if (!field || !Array.isArray(series.values)) continue;
      const step = (series.intervalMillis ?? 1000) / 1000;
      series.values.forEach((v: unknown, i: number) => {
        const value = typeof v === "string" ? Number(v) : v;
        // 0 bpm means no reading.
        if (typeof value === "number" && Number.isFinite(value) && !(field === "hr" && value <= 0)) grid.set(lead + i * step, { [field]: value });
      });
    }
    for (const p of (exercise.routes?.route?.wayPoints ?? []) as Json[]) {
      grid.set(lead + (p.elapsedMillis ?? 0) / 1000, { lat: p.latitude, lon: p.longitude, alt: p.altitude });
    }
    const hrStat = (exercise.statistics?.statistics as Json[] | undefined)?.find((x) => x.type === "STATISTICS_TYPE_HEART_RATE");
    avgHr = positive(hrStat?.avg) ?? positive(s.hrAvg);
    maxHr = positive(hrStat?.max) ?? positive(s.hrMax);
  } else {
    // Older layout: {dateTime, value} samples in local time.
    const at = (dateTime: string) => (wallClockMs(dateTime, offset) - start) / 1000;
    const series: [string, keyof Sample][] = [["heartRate", "hr"], ["distance", "dist"], ["altitude", "alt"], ["cadence", "cad"]];
    for (const [name, field] of series) {
      for (const p of (exercise.samples?.[name] ?? []) as Json[]) {
        if (typeof p.value === "number" && !(field === "hr" && p.value <= 0)) grid.set(at(p.dateTime), { [field]: p.value });
      }
    }
    for (const p of (exercise.samples?.recordedRoute ?? s.recordedRoute ?? []) as Json[]) {
      if (p.dateTime) grid.set(at(p.dateTime), { lat: p.latitude, lon: p.longitude, alt: p.altitude });
    }
    avgHr = positive(exercise.heartRate?.avg) ?? positive(s.averageHeartRate);
    maxHr = positive(exercise.heartRate?.max) ?? positive(s.maximumHeartRate);
  }

  const seconds = positive(s.durationMillis) ? s.durationMillis / 1000 : (isoDuration(s.duration) ?? isoDuration(exercise.duration));
  const distance = positive(s.distanceMeters) ?? positive(exercise.distanceMeters) ?? positive(s.distance) ?? positive(exercise.distance);
  if (!RUN_SPORT.test(sport)) return null;
  return toActivity(
    {
      source: "polar",
      start,
      sport,
      name: typeof s.name === "string" && s.name && s.name !== sport ? s.name : undefined,
      indoor: /treadmill|indoor/i.test(sport) || undefined,
      totalDistance: distance,
      totalSeconds: seconds,
      avgHr,
      maxHr,
      totalAscent: positive(exercise.ascent) ?? positive(s.ascent),
      calories: positive(s.kiloCalories) ?? positive(exercise.kiloCalories),
      device: s.product?.modelName,
      local: wallClock(startText),
    },
    grid.samples,
  );
}
