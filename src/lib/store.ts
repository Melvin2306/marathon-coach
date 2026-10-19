"use client";

// Local-first persistence: everything lives in localStorage on this device.
// useSyncExternalStore renders `undefined` on the server and on the first
// client pass, so pages can show a skeleton instead of a hydration mismatch.
import { useMemo, useSyncExternalStore } from "react";
import { SOURCE_PRIORITY, findSameRun, mergeRuns, type ImportedRun, type ImportSummary } from "./import/common";
import { todayISO } from "./dates";
import { deriveFitness, type DerivedFitness } from "./fitness";
import { generatePlan } from "./plan";
import type { DailyValue, HealthMetrics, Plan, Profile, Run, RunDetails, StravaAthlete } from "./types";
import { HALF, predictTime } from "./vdot";

const KEY = "marathon-coach:v1";

export interface AppData {
  profile: Profile | null;
  runs: Run[];
  health?: HealthMetrics;
  strava?: {
    /** ISO timestamp of the last successful sync */
    lastSync?: string;
    athlete?: StravaAthlete;
  };
  prefs?: {
    /** show workouts as treadmill programs */
    treadmill?: boolean;
  };
}

const EMPTY: AppData = { profile: null, runs: [] };

let cache: AppData | undefined;
const listeners = new Set<() => void>();

function read(): AppData {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as AppData) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: AppData) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked; keep the in-memory copy for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current data outside React (e.g. in sync code). */
export function readData(): AppData {
  return read();
}

export function useAppData(): AppData | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}

/**
 * The profile with current fitness taken from recorded runs where available:
 * fitness becomes a half-marathon equivalent of the derived VDOT, and weekly
 * volume / longest run come from the weeks before the plan started.
 */
export function effectiveProfile(profile: Profile, fitness: DerivedFitness): Profile {
  return {
    ...profile,
    recentRace: fitness.vdot ? { distance: HALF, time: predictTime(fitness.vdot, HALF) } : profile.recentRace,
    weeklyVolume: fitness.weeklyVolume ?? profile.weeklyVolume,
    longestRun: fitness.longestRun ?? profile.longestRun,
  };
}

export interface Coaching {
  /** the profile the plan is built from (see effectiveProfile) */
  profile: Profile;
  plan: Plan;
  fitness: DerivedFitness;
}

export function usePlan(data: AppData | undefined): Coaching | null {
  const profile = data?.profile;
  const runs = data?.runs;
  return useMemo(() => {
    if (!profile || !runs) return null;
    const fitness = deriveFitness(runs, profile.planStart, todayISO());
    const effective = effectiveProfile(profile, fitness);
    return { profile: effective, plan: generatePlan(effective), fitness };
  }, [profile, runs]);
}

export function saveProfile(profile: Profile) {
  write({ ...read(), profile });
}

/**
 * Logs a hand-entered run. If a recorded run (Apple Health, Strava) already
 * exists for it, the effort and notes are attached to that run instead, so
 * measured data stays the source of truth. Returns the run that was kept.
 */
export function addRun(run: Omit<Run, "id">): { merged: boolean; run: Run } {
  const data = read();
  const match = findSameRun(data.runs, run);
  if (match && match.source && match.source !== "manual") {
    const merged = mergeRuns(match, run);
    write({ ...data, runs: data.runs.map((r) => (r.id === match.id ? merged : r)) });
    return { merged: true, run: merged };
  }
  const created = { ...run, id: crypto.randomUUID() };
  write({ ...data, runs: [...data.runs, created].sort((a, b) => a.date.localeCompare(b.date)) });
  return { merged: false, run: created };
}

/** Adds imported runs, merging with entries of the same run from any source. */
export function addRuns(incoming: ImportedRun[]): ImportSummary {
  const data = read();
  const runs = [...data.runs];
  const summary: ImportSummary = { added: 0, replaced: 0, duplicates: 0 };
  for (const run of incoming) {
    const match = findSameRun(runs, run);
    if (!match) {
      runs.push({ ...run, id: crypto.randomUUID() });
      summary.added++;
      continue;
    }
    const merged = mergeRuns(match, run);
    runs[runs.indexOf(match)] = merged;
    if (match.externalId !== run.externalId && SOURCE_PRIORITY[run.source] > SOURCE_PRIORITY[match.source ?? "manual"]) summary.replaced++;
    else summary.duplicates++;
  }
  runs.sort((a, b) => a.date.localeCompare(b.date));
  write({ ...data, runs });
  return summary;
}

export function deleteRun(id: string) {
  const data = read();
  write({ ...data, runs: data.runs.filter((r) => r.id !== id) });
}

/** Merges daily metrics by date; newer imports win for the same day. */
export function saveHealthMetrics(incoming: HealthMetrics) {
  const data = read();
  const current = data.health ?? { restingHr: [], hrv: [], vo2max: [] };
  const merge = (a: DailyValue[], b: DailyValue[]) =>
    [...new Map([...a, ...b].map(([d, v]) => [d, v] as DailyValue)).entries()].sort((x, y) => x[0].localeCompare(y[0]));
  write({
    ...data,
    health: { restingHr: merge(current.restingHr, incoming.restingHr), hrv: merge(current.hrv, incoming.hrv), vo2max: merge(current.vo2max, incoming.vo2max) },
  });
}

/** Adds detail fetched later (e.g. Strava splits and streams) to a logged run. */
export function updateRunDetails(id: string, details: RunDetails) {
  const data = read();
  write({ ...data, runs: data.runs.map((r) => (r.id === id ? { ...r, details: { ...r.details, ...details } } : r)) });
}

export function setTreadmillMode(treadmill: boolean) {
  const data = read();
  write({ ...data, prefs: { ...data.prefs, treadmill } });
}

export function saveStravaState(state: NonNullable<AppData["strava"]>) {
  const data = read();
  write({ ...data, strava: { ...data.strava, ...state } });
}

export function exportData(): string {
  return JSON.stringify(read(), null, 2);
}

export function importData(json: string) {
  const parsed = JSON.parse(json) as AppData;
  if (!Array.isArray(parsed.runs)) throw new Error("Not a Marathon Coach backup");
  write({ profile: parsed.profile ?? null, runs: parsed.runs, health: parsed.health, strava: parsed.strava, prefs: parsed.prefs });
}

export function resetData() {
  write(EMPTY);
}
