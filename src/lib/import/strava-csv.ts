// Reads activities.csv from a Strava bulk export ("Download your data").
// Headers are English, but values such as dates and activity types follow
// the account language, so English and German are both handled.
import { parseCsv } from "./csv";
import type { RawActivity } from "./common";

const MONTHS: [RegExp, number][] = [
  [/^jan/i, 1], [/^feb/i, 2], [/^(mar|mär|maer)/i, 3], [/^apr/i, 4], [/^(may|mai)/i, 5], [/^jun/i, 6],
  [/^jul/i, 7], [/^aug/i, 8], [/^sep/i, 9], [/^(oct|okt)/i, 10], [/^nov/i, 11], [/^(dec|dez)/i, 12],
];

/** Parses "Mar 5, 2023, 7:12:34 AM", "5. März 2023, 07:12:34" or ISO into YYYY-MM-DD. */
export function parseStravaDate(value: string): string | null {
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const year = value.match(/\b(\d{4})\b/)?.[1];
  const monthWord = value.match(/[A-Za-zÄÖÜäöü]{3,}/)?.[0];
  const month = monthWord ? MONTHS.find(([re]) => re.test(monthWord))?.[1] : undefined;
  // The day is the first 1–2 digit number that isn't part of the time.
  const day = value.replace(/\d{1,2}:\d{2}(:\d{2})?/g, "").match(/\b(\d{1,2})\b/)?.[1];
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const isRun = (type: string) => /run|lauf/i.test(type);

const num = (value: string | undefined) => {
  if (!value) return NaN;
  return Number(value.trim().replace(/\s/g, "").replace(",", "."));
};

export interface StravaCsvResult {
  activities: RawActivity[];
  /** rows that were not runs (rides, swims...) */
  ignored: number;
}

export function parseStravaCsv(text: string): StravaCsvResult {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) throw new Error("empty");
  const cols = (name: string) => header.map((h, i) => (h.trim().toLowerCase() === name ? i : -1)).filter((i) => i >= 0);
  const [id] = cols("activity id");
  const [date] = cols("activity date");
  const [type] = cols("activity type");
  const [name] = cols("activity name");
  const distances = cols("distance");
  const [moving] = cols("moving time");
  const [elapsed] = cols("elapsed time");
  const [exertion] = cols("perceived exertion");
  const [avgHr] = cols("average heart rate");
  const [maxHr] = cols("max heart rate");
  if (id === undefined || date === undefined || type === undefined || !distances.length) throw new Error("columns");

  const activities: RawActivity[] = [];
  let ignored = 0;
  for (const row of rows) {
    if (!isRun(row[type] ?? "")) {
      ignored++;
      continue;
    }
    const day = parseStravaDate(row[date] ?? "");
    // The export has a "Distance" column in km and a later one in metres.
    const values = distances.map((i) => num(row[i])).filter((v) => !Number.isNaN(v) && v > 0);
    const metres = values.find((v) => v > 500) ?? (values[0] !== undefined ? values[0] * 1000 : NaN);
    const seconds = num(row[moving]) || num(row[elapsed]);
    if (!day || !(metres > 0) || !(seconds > 0)) continue;
    const rpe = Math.round(num(row[exertion]));
    activities.push({
      externalId: `strava:${row[id].trim()}`,
      source: "strava",
      date: day,
      distance: metres,
      duration: seconds,
      name: name !== undefined ? row[name] : undefined,
      rpe: rpe >= 1 && rpe <= 10 ? rpe : null,
      avgHr: num(row[avgHr]) || undefined,
      maxHr: num(row[maxHr]) || undefined,
      indoor: /virtual|treadmill|laufband/i.test(row[type] ?? "") || undefined,
    });
  }
  return { activities, ignored };
}
