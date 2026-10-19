// Garmin Connect account export ("Export Your Data", a ZIP under DI_CONNECT/).
// The original FIT recordings sit in nested UploadedFiles_*.zip archives and
// are read by fit.ts; this file reads the activity summaries (names, and runs
// whose FIT file is missing) and the daily wellness values.
import { RUN_SPORT, toActivity } from "./activity-files";
import type { RawActivity } from "./common";
import type { DailyMetrics } from "./metrics";

export const isGarminSummaries = (name: string) => /summarizedActivities[^/]*\.json$/i.test(name);
/** Daily summaries with resting heart rate. */
export const isGarminDaily = (name: string) => /(^|\/)UDSFile[^/]*\.json$/i.test(name);
export const isGarminHealthStatus = (name: string) => /healthStatusData[^/]*\.json$/i.test(name);
export const isGarminMaxMet = (name: string) => /MetricsMaxMetData[^/]*\.json$/i.test(name);

interface GarminSummary {
  activityId?: number;
  name?: string;
  activityType?: string | { typeKey?: string };
  /** epoch ms (UTC) */
  startTimeGmt?: number;
  /** epoch ms of the local wall clock */
  startTimeLocal?: number;
  /** ms */
  duration?: number;
  movingDuration?: number;
  /** cm */
  distance?: number;
  /** cm */
  elevationGain?: number;
  avgHr?: number;
  maxHr?: number;
}

/** The export wraps its arrays in one-key objects: [{"summarizedActivitiesExport": [...]}]. */
function unwrap<T>(json: unknown, key: string): T[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>)[key]) ? (item as Record<string, T[]>)[key] : [item as T]));
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseGarminSummaries(json: unknown): RawActivity[] {
  const out: RawActivity[] = [];
  for (const s of unwrap<GarminSummary>(json, "summarizedActivitiesExport")) {
    const type = typeof s.activityType === "string" ? s.activityType : s.activityType?.typeKey;
    if (!type || !RUN_SPORT.test(type) || !s.startTimeGmt || !s.distance || !s.duration) continue;
    // Whole seconds, so the id matches the one the FIT file of the same run gets.
    const start = Math.round(s.startTimeGmt / 1000) * 1000;
    const local = s.startTimeLocal ? new Date(s.startTimeLocal) : undefined;
    const activity = toActivity(
      {
        source: "garmin",
        start,
        sport: type,
        name: s.name,
        indoor: /treadmill|indoor|virtual/i.test(type) || undefined,
        totalDistance: s.distance / 100,
        totalSeconds: s.duration / 1000,
        avgHr: s.avgHr || undefined,
        maxHr: s.maxHr || undefined,
        totalAscent: s.elevationGain !== undefined ? s.elevationGain / 100 : undefined,
        local: local && {
          date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
          time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
        },
      },
      [],
    );
    if (activity) out.push(activity);
  }
  return out;
}

/** "2024-03-10", or an object/date string the older exports use. */
function calendarDate(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? String((value as { date?: unknown }).date ?? "") : "";
  return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}

/** UDSFile_*.json: one entry per day. */
export function readGarminDaily(json: unknown, metrics: DailyMetrics) {
  for (const day of unwrap<Record<string, unknown>>(json, "")) {
    // restingHeartRate is a 7-day average; the day's own value is currentDayRestingHeartRate.
    const rhr = Number(day.currentDayRestingHeartRate ?? day.restingHeartRate);
    metrics.add("restingHr", calendarDate(day.calendarDate), rhr);
  }
}

/** *_healthStatusData.json: overnight HRV (RMSSD) among other metrics. */
export function readGarminHealthStatus(json: unknown, metrics: DailyMetrics) {
  for (const day of unwrap<{ calendarDate?: unknown; metrics?: { type?: string; value?: number }[] }>(json, "")) {
    const hrv = day.metrics?.find((m) => m.type === "HRV")?.value;
    metrics.add("hrvRmssd", calendarDate(day.calendarDate), hrv);
  }
}

/** MetricsMaxMetData_*.json: VO2max estimates. */
export function readGarminMaxMet(json: unknown, metrics: DailyMetrics) {
  for (const entry of unwrap<{ calendarDate?: unknown; vo2MaxValue?: number; sport?: string }>(json, "")) {
    if (entry.sport && !/running/i.test(entry.sport)) continue;
    metrics.add("vo2max", calendarDate(entry.calendarDate), entry.vo2MaxValue);
  }
}
