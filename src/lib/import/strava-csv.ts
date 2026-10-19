// Strava bulk export ("Download or Delete Your Account" → archive ZIP).
// activities.csv lists every activity; its Filename column points at the
// original recording under activities/ (FIT, GPX or TCX, often gzipped),
// which gives the same curves as any other file import. Column names and
// dates follow the account language, so the core columns fall back to their
// fixed positions.
import { localDateTime } from "./activity-files";
import type { RawActivity } from "./common";
import { cellNumber, parseCsv } from "./csv";

export const isStravaCsv = (name: string) => /(^|\/)activities\.csv$/i.test(name);
export const isStravaActivityFile = (name: string) => /(^|\/)activities\/[^/]+\.(fit|gpx|tcx)(\.gz)?$/i.test(name);

/** "export_1/activities/123.fit.gz" and the CSV's "activities/123.fit.gz" → "activities/123.fit" */
export const recordingKey = (path: string | undefined) => path?.slice(Math.max(0, path.search(/activities\//i))).replace(/\.gz$/i, "");

// Month abbreviations in the languages Strava offers (en, de, fr, es, it, pt, nl).
const MONTHS: [RegExp, number][] = [
  [/^(jan|ene|gen)/i, 1], [/^(feb|fév|fev)/i, 2], [/^(mar|mär|maer|mrt)/i, 3], [/^(apr|avr|abr)/i, 4],
  [/^(may|mai|mag|mei)/i, 5], [/^(jun|juin|giu)/i, 6], [/^(jul|juil|lug)/i, 7], [/^(aug|août|aou|ago)/i, 8],
  [/^(sep|set)/i, 9], [/^(oct|okt|ott|out)/i, 10], [/^nov/i, 11], [/^(dec|dez|déc|dic)/i, 12],
];

/**
 * Parses "Oct 12, 2026, 5:00:00 AM", "12. Okt. 2026, 05:00:00" or ISO.
 * Strava writes this column in UTC; returns epoch ms.
 */
export function parseStravaDate(value: string): number | null {
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):?(\d{2})?)?/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0));
  const year = value.match(/\b(\d{4})\b/)?.[1];
  // The first word that names a month ("de" in "12 de ene de 2026" doesn't).
  const month = (value.match(/\p{L}{3,}/gu) ?? []).map((w) => MONTHS.find(([re]) => re.test(w))?.[1]).find(Boolean);
  const clock = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i);
  // The day is the first 1–2 digit number that isn't part of the time.
  const day = value.replace(/\d{1,2}:\d{2}(:\d{2})?/g, "").match(/\b(\d{1,2})\b/)?.[1];
  if (!year || !month || !day) return null;
  let hour = clock ? Number(clock[1]) : 0;
  if (clock?.[4]) hour = (hour % 12) + (/pm/i.test(clock[4]) ? 12 : 0);
  return Date.UTC(+year, month - 1, +day, hour, clock ? +clock[2] : 0, clock?.[3] ? +clock[3] : 0);
}

const isRun = (type: string) => /run|lauf|course|carrera|corsa/i.test(type);

export interface StravaRow {
  id: string;
  /** epoch ms */
  start: number;
  name: string;
  type: string;
  /** path of the original recording inside the archive, e.g. activities/123.fit.gz */
  filename?: string;
  rpe: number | null;
  /** the CSV's own values, used when the recording is missing */
  activity: RawActivity;
}

/** Running rows of activities.csv, and the recordings of rows that aren't runs. */
export function parseStravaCsv(text: string): { rows: StravaRow[]; ignored: number; otherFiles: string[] } {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) throw new Error("empty");
  const names = header.map((h) => h.trim().toLowerCase());
  const cols = (name: string) => names.flatMap((h, i) => (h === name ? [i] : []));
  // Positions of the core columns in every Strava export, whatever the language.
  const id = cols("activity id")[0] ?? 0;
  const date = cols("activity date")[0] ?? 1;
  const name = cols("activity name")[0] ?? 2;
  const type = cols("activity type")[0] ?? 3;
  // "Distance" appears twice: first in km (or miles), later in metres.
  const distances = cols("distance").length ? cols("distance") : [6];
  const moving = cols("moving time")[0];
  const elapsed = cols("elapsed time")[0] ?? 5;
  const filename = cols("filename")[0] ?? names.findIndex((_, i) => rows.some((r) => /^activities\//.test(r[i] ?? "")));
  const col = (row: string[], i: number | undefined) => (i === undefined || i < 0 ? undefined : row[i]);
  const numberAt = (row: string[], label: string) => cellNumber(col(row, cols(label).at(-1)));

  const out: StravaRow[] = [];
  const otherFiles: string[] = [];
  let ignored = 0;
  for (const row of rows) {
    const activityType = row[type] ?? "";
    if (!isRun(activityType)) {
      ignored++;
      const file = col(row, filename);
      if (file) otherFiles.push(file);
      continue;
    }
    // Rows whose date can't be read are left to their recording, if any.
    const start = parseStravaDate(row[date] ?? "");
    if (start === null) continue;
    // The first "Distance" column is in km, the later one in metres.
    const km = cellNumber(row[distances[0]]);
    const metres = (distances.length > 1 ? cellNumber(row[distances[distances.length - 1]]) : undefined) || (km ? km * 1000 : 0);
    const seconds = cellNumber(col(row, moving)) || cellNumber(row[elapsed]) || 0;
    const rpe = Math.round(numberAt(row, "perceived exertion") ?? 0);
    const cadence = numberAt(row, "average cadence");
    const local = localDateTime(start);
    const activityId = row[id].trim();
    out.push({
      id: activityId,
      start,
      name: row[name] ?? "",
      type: activityType,
      filename: col(row, filename) || undefined,
      rpe: rpe >= 1 && rpe <= 10 ? rpe : null,
      activity: {
        externalId: `strava:${activityId}`,
        source: "strava",
        start,
        date: local.date,
        distance: metres,
        duration: seconds,
        name: row[name],
        avgHr: numberAt(row, "average heart rate") || undefined,
        maxHr: numberAt(row, "max heart rate") || undefined,
        indoor: /virtual|treadmill|laufband/i.test(activityType) || undefined,
        details: {
          startTime: local.time,
          stravaId: Number(activityId) || undefined,
          name: row[name] || undefined,
          ...(numberAt(row, "elevation gain") !== undefined ? { elevationGain: Math.round(numberAt(row, "elevation gain")!) } : {}),
          ...(numberAt(row, "calories") ? { calories: Math.round(numberAt(row, "calories")!) } : {}),
          // Strava's running cadence counts one foot.
          ...(cadence ? { cadence: Math.round(cadence * 2) } : {}),
          ...(cellNumber(row[elapsed]) ? { elapsed: cellNumber(row[elapsed]) } : {}),
        },
      },
    });
  }
  return { rows: out, ignored, otherFiles };
}

/**
 * Combines CSV rows with the recordings parsed from activities/: the
 * recording supplies the measured data and curves, the CSV the Strava id,
 * name and effort rating. Rows without a readable recording keep the CSV values.
 */
export function mergeStrava(rows: StravaRow[], recordings: Map<string, RawActivity>, used = new Set<string>()): RawActivity[] {
  return rows
    .map((row) => {
      const key = recordingKey(row.filename);
      const recording = key ? recordings.get(key) : undefined;
      if (key && recording) used.add(key);
      const base = recording ?? row.activity;
      return {
        ...base,
        externalId: row.activity.externalId,
        name: row.name || base.name,
        rpe: row.rpe,
        indoor: base.indoor || row.activity.indoor,
        // The recording supplies the curves; the CSV's elevation is Strava's own (corrected) value.
        details: {
          ...row.activity.details,
          ...recording?.details,
          ...(row.activity.details?.elevationGain !== undefined ? { elevationGain: row.activity.details.elevationGain } : {}),
          stravaId: row.activity.details?.stravaId,
          name: row.name || undefined,
        },
      };
    })
    .filter((a) => a.distance > 0 && a.duration > 0);
}
