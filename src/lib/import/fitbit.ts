// Fitbit data from Google Takeout (or the older fitbit.com account archive).
// Runs come from the exercise-*.json logs, which hold totals and average heart
// rate but no per-second recording; resting heart rate and HRV are daily files.
import { RUN_SPORT, toActivity } from "./activity-files";
import type { RawActivity } from "./common";
import { cellNumber, csvRecords } from "./csv";
import type { DailyMetrics } from "./metrics";

export const isFitbitExercise = (name: string) => /(^|\/)exercise-\d+\.json$/i.test(name);
export const isFitbitRestingHr = (name: string) => /(^|\/)resting_heart_rate-[^/]*\.json$/i.test(name);
export const isFitbitHrv = (name: string) => /(^|\/)Daily Heart Rate Variability Summary[^/]*\.csv$/i.test(name);

/** "10/19/22 00:11:35" (UTC) → epoch ms */
function fitbitTime(value: string | undefined): number {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6])) : NaN;
}

/** "10/19/22" → "2022-10-19" */
const fitbitDay = (value: string | undefined) => {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{2})/);
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : undefined;
};

const UNIT_METERS: Record<string, number> = { Kilometer: 1000, Mile: 1609.344, Meter: 1 };

interface FitbitExercise {
  logId?: number;
  activityName?: string;
  averageHeartRate?: number;
  calories?: number;
  distance?: number;
  distanceUnit?: string;
  /** ms, including pauses */
  duration?: number;
  /** ms, without pauses */
  activeDuration?: number;
  steps?: number;
  startTime?: string;
  source?: { name?: string };
}

export function parseFitbitExercises(json: unknown): RawActivity[] {
  if (!Array.isArray(json)) return [];
  const out: RawActivity[] = [];
  for (const e of json as FitbitExercise[]) {
    if (!e.activityName || !RUN_SPORT.test(e.activityName) || !e.distance) continue;
    const start = fitbitTime(e.startTime);
    const ms = e.activeDuration || e.duration;
    if (!Number.isFinite(start) || !ms) continue;
    const activity = toActivity(
      {
        source: "fitbit",
        start,
        sport: e.activityName,
        totalDistance: e.distance * (UNIT_METERS[e.distanceUnit ?? "Kilometer"] ?? 1000),
        totalSeconds: ms / 1000,
        avgHr: e.averageHeartRate || undefined,
        calories: e.calories,
        indoor: /treadmill/i.test(e.activityName) || undefined,
        device: e.source?.name,
        id: e.logId ? `fitbit:${e.logId}` : undefined,
      },
      [],
    );
    if (!activity) continue;
    if (e.steps) activity.details = { ...activity.details, cadence: Math.round(e.steps / (ms / 60_000)) };
    out.push(activity);
  }
  return out;
}

/** resting_heart_rate-*.json; days without a reading are padded with 0. */
export function readFitbitRestingHr(json: unknown, metrics: DailyMetrics) {
  if (!Array.isArray(json)) return;
  for (const d of json as { dateTime?: string; value?: { date?: string; value?: number } }[]) {
    metrics.add("restingHr", fitbitDay(d.value?.date ?? d.dateTime), d.value?.value);
  }
}

/** Daily Heart Rate Variability Summary - *.csv: timestamp,rmssd,nremhr,entropy */
export function readFitbitHrv(text: string, metrics: DailyMetrics) {
  for (const r of csvRecords(text)) metrics.add("hrvRmssd", r.timestamp?.slice(0, 10), cellNumber(r.rmssd));
}
