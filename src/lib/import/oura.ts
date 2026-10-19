// Oura account export (Membership Hub → Export data): a ZIP of
// semicolon-separated CSVs. Nightly lowest heart rate and HRV come from
// sleepmodel.csv; running workouts from workout.csv, with heart rate from the
// samples Oura tags as "workout" in heartrate.csv.
import { toActivity, wallClock } from "./activity-files";
import type { RawActivity } from "./common";
import { cellNumber, csvRecords } from "./csv";
import type { DailyMetrics } from "./metrics";
import type { Sample } from "./samples";

// Files are named e.g. sleepmodel.csv, or sleepmodel-CWE_fiU8.csv in some exports.
const ouraFile = (base: string) => new RegExp(`(^|/)${base}(-[\\w-]+)?\\.csv$`, "i");
export const isOuraSleep = (name: string) => ouraFile("sleepmodel").test(name);
export const isOuraWorkouts = (name: string) => ouraFile("workout").test(name);
export const isOuraHeartRate = (name: string) => ouraFile("heartrate").test(name);
export const isOuraVo2max = (name: string) => ouraFile("vo2max").test(name);

const records = (text: string) => csvRecords(text, ";", { alignRight: true });

/** Main sleep of each night: lowest heart rate as resting heart rate, average HRV (RMSSD). */
export function readOuraSleep(text: string, metrics: DailyMetrics) {
  for (const r of records(text)) {
    if (r.type && r.type !== "long_sleep") continue;
    metrics.add("restingHr", r.day, cellNumber(r.lowest_heart_rate));
    metrics.add("hrvRmssd", r.day, cellNumber(r.average_hrv));
  }
}

export function readOuraVo2max(text: string, metrics: DailyMetrics) {
  for (const r of records(text)) metrics.add("vo2max", r.day, cellNumber(r.vo2_max));
}

/**
 * heartrate.csv can hold years of 5-minute samples, so it is read as a stream
 * and only the samples recorded during workouts are kept.
 */
export class OuraHeartRate {
  private rest = "";
  readonly samples: { ms: number; bpm: number }[] = [];

  push(chunk: string) {
    const text = this.rest + chunk;
    const lines = text.split(/\r?\n/);
    this.rest = lines.pop() ?? "";
    for (const line of lines) this.line(line);
  }

  finish() {
    if (this.rest) this.line(this.rest);
    this.rest = "";
    this.samples.sort((a, b) => a.ms - b.ms);
  }

  private line(line: string) {
    const [timestamp, bpm, source] = line.replace(/"/g, "").split(";");
    if (source?.trim() !== "workout") return;
    const ms = Date.parse(timestamp);
    const value = Number(bpm);
    if (Number.isFinite(ms) && value > 0) this.samples.push({ ms, bpm: value });
  }
}

/** Running workouts; Oura records no route, so distance is its own estimate. */
export function parseOuraWorkouts(text: string, heartRate: { ms: number; bpm: number }[] = []): RawActivity[] {
  const out: RawActivity[] = [];
  for (const r of records(text)) {
    if (!/run/i.test(r.activity ?? "")) continue;
    const start = Date.parse(r.start_datetime);
    const end = Date.parse(r.end_datetime);
    const distance = cellNumber(r.distance);
    if (!Number.isFinite(start) || !(end > start) || !distance) continue;
    const hr: Sample[] = heartRate.filter((s) => s.ms >= start && s.ms <= end).map((s) => ({ t: (s.ms - start) / 1000, hr: s.bpm }));
    const activity = toActivity(
      {
        source: "oura",
        start,
        sport: r.activity,
        totalDistance: distance,
        totalSeconds: (end - start) / 1000,
        calories: cellNumber(r.calories),
        id: r.id ? `oura:${r.id}` : undefined,
        // The offset in the timestamps is the ring's local time.
        local: wallClock(r.start_datetime),
      },
      hr.length >= 10 ? hr : [],
    );
    if (activity) out.push(activity);
  }
  return out;
}
