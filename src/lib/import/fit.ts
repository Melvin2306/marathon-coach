// FIT activity files (Garmin, COROS, Suunto, Polar, Wahoo, and the originals
// inside Strava and Garmin archives). Decoded with fit-file-parser (MIT).
import FitParser from "fit-file-parser";
import type { RunSource } from "../types";
import { sourceFromCreator, toActivity } from "./activity-files";
import type { RawActivity } from "./common";

interface FitRecord {
  timestamp?: Date | string;
  position_lat?: number;
  position_long?: number;
  distance?: number;
  enhanced_altitude?: number;
  altitude?: number;
  heart_rate?: number;
  cadence?: number;
  fractional_cadence?: number;
}

interface FitSession {
  start_time?: Date | string;
  total_timer_time?: number;
  total_elapsed_time?: number;
  total_distance?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  total_ascent?: number;
  total_calories?: number;
  sport?: string;
  sub_sport?: string;
}

interface FitData {
  file_ids?: { type?: string; manufacturer?: string }[];
  file_id?: { type?: string; manufacturer?: string };
  sessions?: FitSession[];
  records?: FitRecord[];
}

/** FIT files start with a header whose bytes 8–11 read ".FIT". */
export function isFit(bytes: Uint8Array): boolean {
  return bytes.length > 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
}

/**
 * The file type from the file_id message, read without decoding the whole
 * file (4 = activity). Garmin exports hold thousands of monitoring and
 * settings files; this skips them cheaply. Undefined when it can't tell.
 */
export function fitFileType(bytes: Uint8Array): number | undefined {
  let pos = bytes[0];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const defs = new Map<number, { global: number; fields: [number, number][]; size: number }>();
  for (let i = 0; i < 8 && pos < bytes.length; i++) {
    const header = bytes[pos++];
    if (header & 0x80) return undefined; // compressed timestamp before file_id: unusual
    const local = header & 0x0f;
    if (header & 0x40) {
      const little = bytes[pos + 1] === 0;
      const global = view.getUint16(pos + 2, little);
      const count = bytes[pos + 4];
      pos += 5;
      const fields: [number, number][] = [];
      let size = 0;
      for (let f = 0; f < count; f++, pos += 3) {
        fields.push([bytes[pos], size]);
        size += bytes[pos + 1];
      }
      if (header & 0x20) {
        const dev = bytes[pos++];
        for (let f = 0; f < dev; f++, pos += 3) size += bytes[pos + 1];
      }
      defs.set(local, { global, fields, size });
    } else {
      const def = defs.get(local);
      if (!def) return undefined;
      if (def.global === 0) {
        const type = def.fields.find(([num]) => num === 0);
        return type ? bytes[pos + type[1]] : undefined;
      }
      pos += def.size;
    }
  }
  return undefined;
}

const FIT_ACTIVITY = 4;

const ms = (d: Date | string | undefined) => (d === undefined ? NaN : new Date(d).getTime());

/** One running activity from a FIT file, or null for other sports and non-activity files (monitoring, sleep...). */
export async function parseFit(bytes: Uint8Array, fallbackSource: RunSource = "file"): Promise<RawActivity | null> {
  if (!isFit(bytes)) return null;
  const type = fitFileType(bytes);
  if (type !== undefined && type !== FIT_ACTIVITY) return null;
  let data: FitData;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    data = (await new FitParser({ mode: "list", force: true }).parseAsync(buffer)) as FitData;
  } catch {
    return null;
  }
  const fileId = data.file_ids?.[0] ?? data.file_id;
  if (fileId?.type && fileId.type !== "activity") return null;
  const session = data.sessions?.[0];
  const records = (data.records ?? []).filter((r) => Number.isFinite(ms(r.timestamp)));
  const start = ms(session?.start_time) || ms(records[0]?.timestamp);
  if (!Number.isFinite(start)) return null;
  const manufacturer = fileId?.manufacturer;
  const source = manufacturer ? sourceFromCreator(manufacturer) : fallbackSource;
  const sport = session ? [session.sport, session.sub_sport].filter(Boolean).join(" ") : undefined;

  return toActivity(
    {
      source: source === "file" ? fallbackSource : source,
      start,
      sport,
      indoor: /treadmill|indoor|virtual/i.test(session?.sub_sport ?? "") || undefined,
      totalDistance: session?.total_distance || undefined,
      totalSeconds: session?.total_timer_time || undefined,
      avgHr: session?.avg_heart_rate || undefined,
      maxHr: session?.max_heart_rate || undefined,
      totalAscent: session?.total_ascent ?? undefined,
      calories: session?.total_calories || undefined,
    },
    records.map((r) => ({
      t: (ms(r.timestamp) - start) / 1000,
      lat: r.position_lat,
      lon: r.position_long,
      dist: r.distance,
      alt: r.enhanced_altitude ?? r.altitude,
      hr: r.heart_rate || undefined,
      // FIT running cadence counts one foot.
      cad: r.cadence ? (r.cadence + (r.fractional_cadence ?? 0)) * 2 : undefined,
    })),
  );
}
