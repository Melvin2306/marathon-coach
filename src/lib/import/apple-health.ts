// Reads an Apple Health export (export.zip from the Health app, or the
// export.xml inside it) as a stream. One pass picks out running workouts with
// their summary statistics, the heart-rate samples recorded during them, and
// daily resting heart rate, HRV and VO2max. Everything else is skipped unparsed.
import type { DailyValue, HealthMetrics, RunDetails } from "../types";
import { SERIES_STEP } from "../types";
import type { RawActivity } from "./common";
import { streamText, type Progress } from "./files";

const UNIT_METERS: Record<string, number> = { km: 1000, m: 1, mi: 1609.344, ft: 0.3048, yd: 0.9144, cm: 0.01 };
const UNIT_SECONDS: Record<string, number> = { min: 60, s: 1, sec: 1, hr: 3600, h: 3600 };

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

/** "2024-03-10 08:01:02 +0100" → epoch milliseconds */
export function parseHealthDate(value: string): number {
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : NaN;
}

/** "2560 cm" → meters; "59 degF" → °C; "6500 %" → percent (Apple stores it ×100). */
function metadataValue(element: string, key: string): string | undefined {
  return element.match(new RegExp(`<MetadataEntry key="${key}" value="([^"]*)"`))?.[1];
}

function temperatureC(value: string | undefined): number | undefined {
  const m = value?.match(/^([\d.-]+) deg([CF])$/);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Math.round((m[2] === "F" ? ((v - 32) * 5) / 9 : v) * 10) / 10;
}

export interface ParsedWorkout extends RawActivity {
  /** epoch ms, for matching heart-rate samples */
  startMs: number;
  endMs: number;
}

/** Parses one <Workout ...>...</Workout> element. */
export function parseWorkout(element: string): ParsedWorkout | null {
  const open = element.slice(0, element.indexOf(">") + 1);
  const a = attributes(open);
  if (a.workoutActivityType !== "HKWorkoutActivityTypeRunning" || !a.startDate) return null;

  const duration = Number(a.duration) * (UNIT_SECONDS[a.durationUnit ?? "min"] ?? 60);
  // Older exports carry totals on the workout; iOS 16+ moved them into WorkoutStatistics children.
  let distance = a.totalDistance ? Number(a.totalDistance) * (UNIT_METERS[a.totalDistanceUnit ?? "km"] ?? 1000) : 0;
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  const details: RunDetails = {};
  if (a.totalEnergyBurned) details.calories = Math.round(Number(a.totalEnergyBurned));
  let steps = 0;

  for (const m of element.matchAll(/<WorkoutStatistics\b[^>]*>/g)) {
    const s = attributes(m[0]);
    const avg = Number(s.average) || undefined;
    switch (s.type) {
      case "HKQuantityTypeIdentifierDistanceWalkingRunning":
        if (!distance && s.sum) distance = Number(s.sum) * (UNIT_METERS[s.unit ?? "km"] ?? 1000);
        break;
      case "HKQuantityTypeIdentifierHeartRate":
        avgHr = avg;
        maxHr = Number(s.maximum) || undefined;
        break;
      case "HKQuantityTypeIdentifierActiveEnergyBurned":
        if (s.sum) details.calories = Math.round(Number(s.sum));
        break;
      case "HKQuantityTypeIdentifierStepCount":
        steps = Number(s.sum) || 0;
        break;
      case "HKQuantityTypeIdentifierRunningPower":
        if (avg) details.power = Math.round(avg);
        break;
      case "HKQuantityTypeIdentifierRunningStrideLength":
        if (avg) details.strideLength = Math.round(avg * (UNIT_METERS[s.unit ?? "m"] ?? 1) * 100) / 100;
        break;
      case "HKQuantityTypeIdentifierRunningGroundContactTime":
        if (avg) details.groundContact = Math.round(avg);
        break;
      case "HKQuantityTypeIdentifierRunningVerticalOscillation":
        if (avg) details.verticalOscillation = Math.round(avg * 10) / 10;
        break;
      case "HKQuantityTypeIdentifierRunningSpeed":
        if (s.maximum) details.maxSpeed = Number(s.maximum) * (s.unit === "km/hr" ? 1 / 3.6 : 1);
        break;
    }
  }
  if (!(distance > 0) || !(duration > 0)) return null;
  if (steps) details.cadence = Math.round(steps / (duration / 60));

  const elevation = metadataValue(element, "HKElevationAscended")?.match(/^([\d.]+) (\w+)$/);
  if (elevation) details.elevationGain = Math.round(Number(elevation[1]) * (UNIT_METERS[elevation[2]] ?? 1));
  details.temperature = temperatureC(metadataValue(element, "HKWeatherTemperature"));
  const humidity = Number(metadataValue(element, "HKWeatherHumidity")?.split(" ")[0]);
  if (humidity) details.humidity = Math.round(humidity / 100);
  if (a.sourceName) details.device = a.sourceName;
  details.startTime = a.startDate.slice(11, 16);
  const startMs = parseHealthDate(a.startDate);
  const endMs = a.endDate ? parseHealthDate(a.endDate) : startMs + duration * 1000;
  details.elapsed = Math.round((endMs - startMs) / 1000) || undefined;
  for (const k of Object.keys(details) as (keyof RunDetails)[]) if (details[k] === undefined) delete details[k];

  return {
    externalId: `apple-health:${a.startDate}`,
    source: "apple-health",
    // "2024-03-10 08:01:02 +0100" is already in the device's local time.
    date: a.startDate.slice(0, 10),
    distance,
    duration,
    avgHr,
    maxHr,
    indoor: /<MetadataEntry key="HKIndoorWorkout" value="1"/.test(element),
    details,
    startMs,
    endMs,
  };
}

/**
 * Averages heart-rate samples inside [start, end] into SERIES_STEP buckets,
 * using only the source that recorded the run (the one with the most samples
 * in that window), so a phone or second device can't skew it.
 */
export function bucketHeartRate(times: Float64Array, bpm: Uint8Array, sources: Uint8Array, count: number, startMs: number, endMs: number): number[] | undefined {
  // Binary search the first sample at or after the start.
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < startMs) lo = mid + 1;
    else hi = mid;
  }
  const buckets = Math.ceil((endMs - startMs) / 1000 / SERIES_STEP);
  if (buckets <= 0 || buckets > 24 * 120) return undefined;
  const perSource = new Map<number, number>();
  for (let i = lo; i < count && times[i] <= endMs; i++) perSource.set(sources[i], (perSource.get(sources[i]) ?? 0) + 1);
  const source = [...perSource.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sum = new Float64Array(buckets);
  const n = new Uint16Array(buckets);
  let found = 0;
  for (let i = lo; i < count && times[i] <= endMs; i++) {
    if (sources[i] !== source) continue;
    const b = Math.min(buckets - 1, Math.floor((times[i] - startMs) / 1000 / SERIES_STEP));
    sum[b] += bpm[i];
    n[b]++;
    found++;
  }
  if (found < 10) return undefined;
  return Array.from(sum, (s, i) => (n[i] ? Math.round(s / n[i]) : 0));
}

type DailyType = "RestingHeartRate" | "HeartRateVariabilitySDNN" | "VO2Max";

const SCAN =
  /<Record type="HKQuantityTypeIdentifier(HeartRate|RestingHeartRate|HeartRateVariabilitySDNN|VO2Max)"([^>]*)>|<Workout /g;

export interface AppleHealthImport {
  workouts: RawActivity[];
  metrics: HealthMetrics;
}

/**
 * Reads the export. Heart-rate samples and daily metrics older than `since`
 * are skipped to keep memory flat on multi-year exports.
 */
export async function parseAppleHealthExport(file: File, onProgress: Progress, since = "0000-00-00"): Promise<AppleHealthImport> {
  const workouts: ParsedWorkout[] = [];
  const daily: Record<DailyType, Map<string, number[]>> = {
    RestingHeartRate: new Map(),
    HeartRateVariabilitySDNN: new Map(),
    VO2Max: new Map(),
  };
  let times = new Float64Array(1 << 16);
  let bpm = new Uint8Array(1 << 16);
  let src = new Uint8Array(1 << 16);
  const sourceIds = new Map<string, number>();
  let samples = 0;
  let buffer = "";

  const addSample = (time: number, value: number, sourceName: string) => {
    if (samples === times.length) {
      const t = new Float64Array(times.length * 2);
      t.set(times);
      times = t;
      const b = new Uint8Array(bpm.length * 2);
      b.set(bpm);
      bpm = b;
      const s = new Uint8Array(src.length * 2);
      s.set(src);
      src = s;
    }
    if (!sourceIds.has(sourceName)) sourceIds.set(sourceName, sourceIds.size % 256);
    times[samples] = time;
    bpm[samples] = Math.min(255, Math.round(value));
    src[samples] = sourceIds.get(sourceName)!;
    samples++;
  };

  const drain = () => {
    let pos = 0;
    let pendingWorkout = false;
    for (;;) {
      SCAN.lastIndex = pos;
      const m = SCAN.exec(buffer);
      if (!m) break;
      if (m[1]) {
        const attrs = attributes(m[2]);
        pos = SCAN.lastIndex;
        if (!attrs.startDate || attrs.startDate.slice(0, 10) < since) continue;
        const value = Number(attrs.value);
        if (!Number.isFinite(value)) continue;
        if (m[1] === "HeartRate") {
          addSample(parseHealthDate(attrs.startDate), value, attrs.sourceName ?? "");
        } else {
          const day = attrs.startDate.slice(0, 10);
          const list = daily[m[1] as DailyType];
          list.set(day, [...(list.get(day) ?? []), value]);
        }
        continue;
      }
      // A <Workout>: wait until the whole element has arrived.
      const tagEnd = buffer.indexOf(">", m.index);
      if (tagEnd < 0) {
        pos = m.index;
        pendingWorkout = true;
        break;
      }
      let end: number;
      if (buffer[tagEnd - 1] === "/") end = tagEnd + 1;
      else {
        const close = buffer.indexOf("</Workout>", tagEnd);
        if (close < 0) {
          pos = m.index;
          pendingWorkout = true;
          break;
        }
        end = close + "</Workout>".length;
      }
      const workout = parseWorkout(buffer.slice(m.index, end));
      if (workout) workouts.push(workout);
      pos = end;
    }
    // Keep an unfinished workout whole; otherwise only a possibly incomplete last tag.
    const rest = buffer.slice(pos);
    buffer = pendingWorkout ? rest : rest.slice(Math.max(0, rest.lastIndexOf("<")));
  };

  const found = await streamText(
    file,
    (chunk) => {
      buffer += chunk;
      drain();
    },
    onProgress,
    (name) => /(^|\/)export\.xml$/i.test(name),
  );
  if (!found) throw new Error("no-export-xml");

  // Samples arrive grouped by source, so sort by time before matching them to workouts.
  const order = Array.from({ length: samples }, (_, i) => i).sort((x, y) => times[x] - times[y]);
  const sortedTimes = Float64Array.from(order, (i) => times[i]);
  const sortedBpm = Uint8Array.from(order, (i) => bpm[i]);
  const sortedSources = Uint8Array.from(order, (i) => src[i]);
  for (const w of workouts) {
    if (w.date < since) continue;
    const series = bucketHeartRate(sortedTimes, sortedBpm, sortedSources, samples, w.startMs, w.endMs);
    if (series) w.details = { ...w.details, hrSeries: series };
  }

  const toDaily = (map: Map<string, number[]>): DailyValue[] =>
    [...map.entries()].map(([d, values]) => [d, Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10] as DailyValue).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    // startMs/endMs ride along but are dropped by toRuns, which copies known fields only.
    workouts,
    metrics: { restingHr: toDaily(daily.RestingHeartRate), hrv: toDaily(daily.HeartRateVariabilitySDNN), vo2max: toDaily(daily.VO2Max) },
  };
}
