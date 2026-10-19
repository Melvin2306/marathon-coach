import { weekIndexOf } from "../coach";
import type { Plan, Run, RunDetails, RunKind, RunSource } from "../types";

/** A run read from an external source, before it gets an id in the store. */
export interface ImportedRun extends Omit<Run, "id"> {
  source: RunSource;
  externalId: string;
}

export interface RawActivity {
  externalId: string;
  source: RunSource;
  /** epoch ms of the start, when known; used to match the same run across files */
  start?: number;
  /** ISO date in the runner's local time */
  date: string;
  distance: number;
  duration: number;
  name?: string;
  /** the source's own classification, when it has one */
  kindHint?: RunKind | null;
  rpe?: number | null;
  avgHr?: number;
  maxHr?: number;
  indoor?: boolean;
  details?: RunDetails;
}

const LONG_RUN = 18_000;

/** Classifies a run using the source hint, then the plan, then its distance. */
export function inferKind(plan: Plan | null, date: string, distance: number, hint?: RunKind | null): RunKind {
  if (hint) return hint;
  const planned = plan?.weeks[weekIndexOf(plan, date)]?.workouts.find((w) => w.date === date);
  if (planned) {
    if (planned.type === "race" || planned.type === "tuneup") return distance >= 15_000 ? "race" : "easy";
    if (planned.type === "timetrial") return "race";
    if (planned.type === "long" || planned.type === "long-mp") return "long";
    if (["tempo", "intervals", "hills", "fartlek", "marathon"].includes(planned.type)) return "workout";
  }
  return distance >= LONG_RUN ? "long" : "easy";
}

export function toRuns(activities: RawActivity[], plan: Plan | null, since: string): ImportedRun[] {
  return activities
    .filter((a) => a.date >= since && a.distance > 0 && a.duration > 0)
    .map((a) => ({
      source: a.source,
      externalId: a.externalId,
      date: a.date,
      distance: Math.round(a.distance),
      duration: Math.round(a.duration),
      rpe: a.rpe ?? null,
      kind: inferKind(plan, a.date, a.distance, a.kindHint),
      notes: a.name?.trim() ?? "",
      ...(a.avgHr ? { avgHr: Math.round(a.avgHr) } : {}),
      ...(a.maxHr ? { maxHr: Math.round(a.maxHr) } : {}),
      ...(a.indoor ? { indoor: true } : {}),
      ...(a.details ? { details: a.details } : {}),
    }));
}

/**
 * Measured data beats typed data: an Apple Health workout replaces a matching
 * Strava or manual entry, and a Strava activity replaces a manual one.
 */
export const SOURCE_PRIORITY: Record<RunSource, number> = {
  manual: 0,
  // Workout summaries without the original recording.
  strava: 1,
  whoop: 1,
  fitbit: 1,
  oura: 1,
  // Original recordings from the device.
  "apple-health": 2,
  garmin: 2,
  polar: 2,
  coros: 2,
  suunto: 2,
  wahoo: 2,
  file: 2,
};

const sourceOf = (run: Pick<Run, "source">): RunSource => run.source ?? "manual";

// Two devices recording the same run agree closely; a hand-typed distance
// is often rounded ("10 km" for a 10.4 km watch run).
const DEVICE_TOLERANCE = 0.03;
const MANUAL_TOLERANCE = 0.15;

/**
 * Finds the logged run that is the same activity as `incoming`, e.g. a watch
 * run that synced to both Apple Health and Strava, or a run typed in by hand.
 */
export function findSameRun<T extends Pick<Run, "date" | "distance" | "externalId" | "source">>(runs: T[], incoming: Pick<Run, "date" | "distance" | "externalId" | "source">): T | undefined {
  if (incoming.externalId) {
    const exact = runs.find((r) => r.externalId === incoming.externalId);
    if (exact) return exact;
  }
  let best: T | undefined;
  let bestDiff = Infinity;
  for (const r of runs) {
    if (r.date !== incoming.date) continue;
    const diff = Math.abs(r.distance - incoming.distance) / Math.max(r.distance, incoming.distance);
    const manual = sourceOf(r) === "manual" || sourceOf(incoming) === "manual";
    if (diff <= (manual ? MANUAL_TOLERANCE : DEVICE_TOLERANCE) && diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Merges two records of the same run. Distance, time and date come from the
 * higher-priority source; the runner's own effort rating, notes and run type
 * are kept whenever they exist.
 */
export function mergeRuns(existing: Run, incoming: Omit<Run, "id">): Run {
  // Equal priority means a re-import of the same source: the fresh copy wins
  // (e.g. it may now carry heart rate).
  const preferIncoming = SOURCE_PRIORITY[sourceOf(incoming)] >= SOURCE_PRIORITY[sourceOf(existing)];
  const measured = preferIncoming ? incoming : existing;
  const other = preferIncoming ? existing : incoming;
  const userKind = sourceOf(existing) === "manual" ? existing.kind : sourceOf(incoming) === "manual" ? incoming.kind : existing.kind;
  return {
    id: existing.id,
    date: measured.date,
    distance: measured.distance,
    duration: measured.duration,
    source: sourceOf(measured),
    externalId: measured.externalId,
    kind: userKind,
    rpe: existing.rpe ?? incoming.rpe,
    notes: [existing.notes, incoming.notes].filter((n, i, all) => n && all.indexOf(n) === i).join(" · "),
    ...(measured.avgHr ?? other.avgHr ? { avgHr: measured.avgHr ?? other.avgHr } : {}),
    ...(measured.maxHr ?? other.maxHr ? { maxHr: measured.maxHr ?? other.maxHr } : {}),
    ...(measured.indoor ? { indoor: true } : {}),
    // Each source fills the other's gaps, e.g. Strava's kudos and splits next to Apple Health's heart-rate samples.
    ...(measured.details || other.details ? { details: { ...other.details, ...measured.details } } : {}),
  };
}

export interface ImportSummary {
  added: number;
  /** existing entries whose data was replaced by this, more precise source */
  replaced: number;
  duplicates: number;
}
