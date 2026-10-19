// WHOOP data export (App Settings → Data Export): CSVs with English headers.
// Recovery values come from physiological_cycles.csv, runs from workouts.csv.
// WHOOP keeps no per-second heart rate in the export, only averages.
import { toActivity, wallClock, wallClockMs } from "./activity-files";
import type { RawActivity } from "./common";
import { cellNumber, csvRecords } from "./csv";
import type { DailyMetrics } from "./metrics";

export const isWhoopCycles = (name: string) => /(^|\/)physiological_cycles\.csv$/i.test(name);
export const isWhoopWorkouts = (name: string) => /(^|\/)workouts\.csv$/i.test(name);

/** "UTC+02:00" → 120 */
function offsetMinutes(zone: string | undefined): number {
  const m = zone?.match(/([+-])(\d{1,2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** A cycle runs from falling asleep to the next sleep; its recovery belongs to the morning you wake up. */
export function readWhoopCycles(text: string, metrics: DailyMetrics) {
  for (const r of csvRecords(text)) {
    const day = (r["Wake onset"] || r["Cycle start time"])?.slice(0, 10);
    metrics.add("restingHr", day, cellNumber(r["Resting heart rate (bpm)"]));
    metrics.add("hrvRmssd", day, cellNumber(r["Heart rate variability (ms)"]));
  }
}

export function parseWhoopWorkouts(text: string): RawActivity[] {
  const out: RawActivity[] = [];
  for (const r of csvRecords(text)) {
    const sport = r["Activity name"];
    const startText = r["Workout start time"];
    const distance = cellNumber(r["Distance (meters)"]);
    const minutes = cellNumber(r["Duration (min)"]);
    if (!sport || !/run/i.test(sport) || !startText || !distance || !minutes) continue;
    const start = wallClockMs(startText, offsetMinutes(r["Cycle timezone"]));
    const activity = toActivity(
      {
        source: "whoop",
        start,
        sport,
        totalDistance: distance,
        totalSeconds: minutes * 60,
        avgHr: cellNumber(r["Average HR (bpm)"]),
        maxHr: cellNumber(r["Max HR (bpm)"]),
        // WHOOP labels kilocalories "cal".
        calories: cellNumber(r["Energy burned (cal)"]),
        totalAscent: cellNumber(r["Altitude gain (meters)"]),
        indoor: /treadmill/i.test(sport) || undefined,
        local: wallClock(startText),
      },
      [],
    );
    if (activity) out.push(activity);
  }
  return out;
}
