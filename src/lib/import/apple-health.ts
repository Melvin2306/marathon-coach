// Apple Health export (export.zip from the Health app). The main XML is read
// as a stream: running workouts with their statistics and metadata, the
// heart-rate samples recorded during them, and daily resting heart rate, HRV
// and VO2max. Workout routes (GPX) add pace and elevation curves.
import type { DailyValue, HealthMetrics, RunDetails } from "../types";
import { gpxPoints, toActivity } from "./activity-files";
import type { RawActivity } from "./common";
import type { Sample } from "./samples";

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

function metadataValue(element: string, key: string): string | undefined {
  return element.match(new RegExp(`<MetadataEntry key="${key}" value="([^"]*)"`))?.[1];
}

function temperatureC(value: string | undefined): number | undefined {
  const m = value?.match(/^([\d.-]+) deg([CF])$/);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Math.round((m[2] === "F" ? ((v - 32) * 5) / 9 : v) * 10) / 10;
}

/** The main XML is export.xml in English and localized elsewhere (e.g. 导出.xml); export_cda.xml is clinical data. */
export const isAppleExportXml = (name: string) => /(^|\/)apple_health_export\/[^/]+\.xml$/i.test(name) && !/export_cda\.xml$/i.test(name);
export const isAppleRoute = (name: string) => /(^|\/)workout-routes\/[^/]+\.gpx$/i.test(name);

/** A running workout as stated in the export, before samples are attached. */
export interface AppleWorkout {
  startDate: string;
  startMs: number;
  endMs: number;
  distance: number;
  duration: number;
  avgHr?: number;
  maxHr?: number;
  indoor: boolean;
  routePath?: string;
  details: RunDetails;
}

/** Parses one <Workout ...>...</Workout> element. */
export function parseWorkout(element: string): AppleWorkout | null {
  const open = element.slice(0, element.indexOf(">") + 1);
  const a = attributes(open);
  if (a.workoutActivityType !== "HKWorkoutActivityTypeRunning" || !a.startDate) return null;

  const duration = Number(a.duration) * (UNIT_SECONDS[a.durationUnit ?? "min"] ?? 60);
  // iOS 16+ nests per-part statistics in <WorkoutActivity>; the workout's own totals are outside them.
  const parts = [...element.matchAll(/<WorkoutActivity\b[\s\S]*?<\/WorkoutActivity>/g)].map((m) => m[0]);
  const totalsXml = element.replace(/<WorkoutActivity\b[\s\S]*?<\/WorkoutActivity>/g, "");
  const stats = (xml: string) => [...xml.matchAll(/<WorkoutStatistics\b[^>]*>/g)].map((m) => attributes(m[0]));
  const totals = stats(totalsXml);
  const partStats = parts.flatMap(stats);
  const find = (type: string) => totals.find((s) => s.type === `HKQuantityTypeIdentifier${type}`);
  // Older exports carry totals as attributes on <Workout>.
  let distance = a.totalDistance ? Number(a.totalDistance) * (UNIT_METERS[a.totalDistanceUnit ?? "km"] ?? 1000) : 0;
  const distStat = find("DistanceWalkingRunning");
  if (!distance && distStat?.sum) distance = Number(distStat.sum) * (UNIT_METERS[distStat.unit ?? "km"] ?? 1000);
  if (!distance) {
    distance = partStats
      .filter((s) => s.type === "HKQuantityTypeIdentifierDistanceWalkingRunning" && s.sum)
      .reduce((sum, s) => sum + Number(s.sum) * (UNIT_METERS[s.unit ?? "km"] ?? 1000), 0);
  }
  if (!(distance > 0) || !(duration > 0)) return null;

  const details: RunDetails = {};
  const hr = find("HeartRate");
  const energy = find("ActiveEnergyBurned");
  if (energy?.sum) details.calories = Math.round(Number(energy.sum) * (energy.unit === "kJ" ? 1 / 4.184 : 1));
  else if (a.totalEnergyBurned) details.calories = Math.round(Number(a.totalEnergyBurned));
  const steps = Number(find("StepCount")?.sum) || 0;
  if (steps) details.cadence = Math.round(steps / (duration / 60));
  const avg = (type: string) => Number(find(type)?.average) || undefined;
  if (avg("RunningPower")) details.power = Math.round(avg("RunningPower")!);
  const stride = find("RunningStrideLength");
  if (stride?.average) details.strideLength = Math.round(Number(stride.average) * (UNIT_METERS[stride.unit ?? "m"] ?? 1) * 100) / 100;
  if (avg("RunningGroundContactTime")) details.groundContact = Math.round(avg("RunningGroundContactTime")!);
  if (avg("RunningVerticalOscillation")) details.verticalOscillation = Math.round(avg("RunningVerticalOscillation")! * 10) / 10;
  const speed = find("RunningSpeed");
  if (speed?.maximum) details.maxSpeed = Number(speed.maximum) * (speed.unit === "km/hr" ? 1 / 3.6 : speed.unit === "mi/hr" ? 0.44704 : 1);

  const elevation = metadataValue(element, "HKElevationAscended")?.match(/^([\d.]+) (\w+)$/);
  if (elevation) details.elevationGain = Math.round(Number(elevation[1]) * (UNIT_METERS[elevation[2]] ?? 1));
  details.temperature = temperatureC(metadataValue(element, "HKWeatherTemperature"));
  const humidity = Number(metadataValue(element, "HKWeatherHumidity")?.split(" ")[0]);
  if (humidity) details.humidity = Math.round(humidity / 100);
  if (a.sourceName) details.device = a.sourceName;
  for (const k of Object.keys(details) as (keyof RunDetails)[]) if (details[k] === undefined) delete details[k];

  const startMs = parseHealthDate(a.startDate);
  const endMs = a.endDate ? parseHealthDate(a.endDate) : startMs + duration * 1000;
  return {
    startDate: a.startDate,
    startMs,
    endMs,
    distance,
    duration,
    avgHr: Number(hr?.average) || undefined,
    maxHr: Number(hr?.maximum) || undefined,
    indoor: /<MetadataEntry key="HKIndoorWorkout" value="1"/.test(element),
    routePath: element.match(/<FileReference path="([^"]+)"/)?.[1],
    details,
  };
}

type DailyType = "RestingHeartRate" | "HeartRateVariabilitySDNN" | "VO2Max";
const SCAN =
  /<Record type="HKQuantityTypeIdentifier(HeartRate|RestingHeartRate|HeartRateVariabilitySDNN|VO2Max)"([^>]*)>|<Workout /g;

/**
 * Incremental reader for the main XML: feed it text chunks, then call
 * finish() with the workout-route GPX files. Heart-rate samples and daily
 * values older than `since` are skipped to keep memory flat.
 */
export class AppleHealthReader {
  private workouts: AppleWorkout[] = [];
  private daily: Record<DailyType, Map<string, number[]>> = { RestingHeartRate: new Map(), HeartRateVariabilitySDNN: new Map(), VO2Max: new Map() };
  private times = new Float64Array(1 << 16);
  private bpm = new Uint8Array(1 << 16);
  private src = new Uint8Array(1 << 16);
  private sourceIds = new Map<string, number>();
  private samples = 0;
  private buffer = "";
  /** route points by file name, stored compactly: [ms, lat, lon, alt] per point */
  private routes = new Map<string, Float64Array>();
  /** the stream contained a <HealthData> document at all */
  sawHealthData = false;

  constructor(private since = "0000-00-00") {}

  private addSample(time: number, value: number, sourceName: string) {
    if (this.samples === this.times.length) {
      const times = new Float64Array(this.times.length * 2);
      times.set(this.times);
      this.times = times;
      const bpm = new Uint8Array(this.bpm.length * 2);
      bpm.set(this.bpm);
      this.bpm = bpm;
      const src = new Uint8Array(this.src.length * 2);
      src.set(this.src);
      this.src = src;
    }
    if (!this.sourceIds.has(sourceName)) this.sourceIds.set(sourceName, this.sourceIds.size % 256);
    this.times[this.samples] = time;
    this.bpm[this.samples] = Math.min(255, Math.round(value));
    this.src[this.samples] = this.sourceIds.get(sourceName)!;
    this.samples++;
  }

  push(chunk: string) {
    this.buffer += chunk;
    if (!this.sawHealthData && this.buffer.includes("<HealthData")) this.sawHealthData = true;
    let pos = 0;
    let pendingWorkout = false;
    for (;;) {
      SCAN.lastIndex = pos;
      const m = SCAN.exec(this.buffer);
      if (!m) break;
      if (m[1]) {
        const attrs = attributes(m[2]);
        pos = SCAN.lastIndex;
        if (!attrs.startDate || attrs.startDate.slice(0, 10) < this.since) continue;
        const value = Number(attrs.value);
        if (!Number.isFinite(value)) continue;
        if (m[1] === "HeartRate") {
          this.addSample(parseHealthDate(attrs.startDate), value, attrs.sourceName ?? "");
        } else {
          const day = attrs.startDate.slice(0, 10);
          const list = this.daily[m[1] as DailyType];
          list.set(day, [...(list.get(day) ?? []), value]);
        }
        continue;
      }
      // A <Workout>: wait until the whole element has arrived.
      const tagEnd = this.buffer.indexOf(">", m.index);
      let end = -1;
      if (tagEnd >= 0) {
        if (this.buffer[tagEnd - 1] === "/") end = tagEnd + 1;
        else {
          const close = this.buffer.indexOf("</Workout>", tagEnd);
          if (close >= 0) end = close + "</Workout>".length;
        }
      }
      if (end < 0) {
        pos = m.index;
        pendingWorkout = true;
        break;
      }
      const workout = parseWorkout(this.buffer.slice(m.index, end));
      if (workout) this.workouts.push(workout);
      pos = end;
    }
    // Keep an unfinished workout whole; otherwise only a possibly incomplete last tag.
    const rest = this.buffer.slice(pos);
    this.buffer = pendingWorkout ? rest : rest.slice(Math.max(0, rest.lastIndexOf("<")));
  }

  /** Heart-rate samples inside a workout, from the device that recorded the most of them. */
  private heartRate(times: Float64Array, bpm: Uint8Array, src: Uint8Array, w: AppleWorkout): Sample[] {
    let lo = 0;
    let hi = this.samples;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < w.startMs) lo = mid + 1;
      else hi = mid;
    }
    const counts = new Map<number, number>();
    for (let i = lo; i < this.samples && times[i] <= w.endMs; i++) counts.set(src[i], (counts.get(src[i]) ?? 0) + 1);
    const source = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const out: Sample[] = [];
    for (let i = lo; i < this.samples && times[i] <= w.endMs; i++) {
      if (src[i] === source) out.push({ t: (times[i] - w.startMs) / 1000, hr: bpm[i] });
    }
    return out.length >= 10 ? out : [];
  }

  /**
   * A workout-routes/*.gpx file. Routes can arrive before or after the main
   * XML, so they're kept until finish(), as numbers rather than text, and
   * only from `since` on: a multi-year export holds thousands of them.
   */
  addRoute(path: string, gpx: string) {
    const points = gpxPoints(gpx);
    // A day of slack: the route's instant and the workout's local date can straddle midnight.
    if (!points.length || points[0].ms < Date.parse(this.since) - 86_400_000) return;
    const packed = new Float64Array(points.length * 4);
    points.forEach((p, i) => packed.set([p.ms, p.lat ?? NaN, p.lon ?? NaN, p.alt ?? NaN], i * 4));
    this.routes.set(path.split("/").pop()!, packed);
  }

  private routeSamples(w: AppleWorkout): Sample[] {
    const packed = w.routePath ? this.routes.get(w.routePath.split("/").pop()!) : undefined;
    if (!packed) return [];
    const out: Sample[] = [];
    const value = (v: number) => (Number.isNaN(v) ? undefined : v);
    for (let i = 0; i < packed.length; i += 4) out.push({ t: (packed[i] - w.startMs) / 1000, lat: value(packed[i + 1]), lon: value(packed[i + 2]), alt: value(packed[i + 3]) });
    return out;
  }

  /** Builds activities and daily metrics. */
  finish(): { activities: RawActivity[]; metrics: HealthMetrics } {
    // Samples arrive grouped by source, so sort by time before matching them to workouts.
    const order = Array.from({ length: this.samples }, (_, i) => i).sort((x, y) => this.times[x] - this.times[y]);
    const times = Float64Array.from(order, (i) => this.times[i]);
    const bpm = Uint8Array.from(order, (i) => this.bpm[i]);
    const src = Uint8Array.from(order, (i) => this.src[i]);

    const activities: RawActivity[] = [];
    for (const w of this.workouts) {
      if (w.startDate.slice(0, 10) < this.since) continue;
      const activity = toActivity(
        {
          source: "apple-health",
          start: w.startMs,
          sport: "running",
          totalDistance: w.distance,
          totalSeconds: w.duration,
          avgHr: w.avgHr,
          maxHr: w.maxHr,
          totalAscent: w.details.elevationGain,
          calories: w.details.calories,
          indoor: w.indoor,
          device: w.details.device,
          id: `apple-health:${w.startDate}`,
          // Apple's own date and time are already in the device's local time zone.
          local: { date: w.startDate.slice(0, 10), time: w.startDate.slice(11, 16) },
        },
        [...this.routeSamples(w), ...this.heartRate(times, bpm, src, w)],
      );
      if (!activity) continue;
      const elapsed = Math.round((w.endMs - w.startMs) / 1000);
      activities.push({ ...activity, details: { ...activity.details, ...w.details, ...(elapsed > 0 ? { elapsed } : {}) } });
    }

    const toDaily = (map: Map<string, number[]>): DailyValue[] =>
      [...map.entries()].map(([d, values]) => [d, Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10] as DailyValue).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      activities,
      metrics: { restingHr: toDaily(this.daily.RestingHeartRate), hrv: toDaily(this.daily.HeartRateVariabilitySDNN), vo2max: toDaily(this.daily.VO2Max) },
    };
  }
}
