"use client";

// Browser side of the Strava integration: pulls new activities, the athlete
// profile and detail for the newest runs through our API routes.
import { addDays, todayISO } from "../dates";
import { toRuns, type ImportSummary, type RawActivity } from "../import/common";
import { addRuns, readData, saveStravaState, updateRunDetails } from "../store";
import type { Plan, RunDetails, StravaAthlete } from "../types";

export interface StravaStatus {
  configured: boolean;
  connected: boolean;
  athlete: string | null;
}

export type SyncResult =
  | { ok: true; summary: ImportSummary; found: number }
  | { ok: false; error: "not-connected" | "unavailable" | "skipped" };

/** Auto-sync at most this often; "Sync now" bypasses it. */
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
/** Re-read a few days before the last sync so edits on Strava come through. */
const OVERLAP_DAYS = 3;
const FIRST_SYNC_DAYS = 365;
/** Full detail (splits, streams) is fetched automatically for this many of the newest runs per sync. */
const AUTO_DETAIL_RUNS = 3;

let inFlight: Promise<SyncResult> | null = null;

export async function fetchStravaStatus(): Promise<StravaStatus> {
  try {
    return (await (await fetch("/api/strava/status")).json()) as StravaStatus;
  } catch {
    return { configured: false, connected: false, athlete: null };
  }
}

export function syncStrava(plan: Plan | null, { force = false } = {}): Promise<SyncResult> {
  inFlight ??= run(plan, force).finally(() => (inFlight = null));
  return inFlight;
}

async function run(plan: Plan | null, force: boolean): Promise<SyncResult> {
  const lastSync = readData().strava?.lastSync;
  if (!force && lastSync && Date.now() - Date.parse(lastSync) < AUTO_SYNC_INTERVAL_MS) return { ok: false, error: "skipped" };
  const since = lastSync ? addDays(lastSync.slice(0, 10), -OVERLAP_DAYS) : addDays(todayISO(), -FIRST_SYNC_DAYS);

  const res = await fetch(`/api/strava/activities?since=${since}`).catch(() => null);
  if (!res) return { ok: false, error: "unavailable" };
  if (res.status === 401) return { ok: false, error: "not-connected" };
  if (!res.ok) return { ok: false, error: "unavailable" };
  const { activities } = (await res.json()) as { activities: RawActivity[] };
  const summary = addRuns(toRuns(activities, plan, since));

  const athlete = await fetch("/api/strava/athlete")
    .then((r) => (r.ok ? (r.json() as Promise<{ athlete: StravaAthlete }>) : null))
    .catch(() => null);
  saveStravaState({ lastSync: new Date().toISOString(), ...(athlete ? { athlete: athlete.athlete } : {}) });

  const newest = readData()
    .runs.filter((r) => r.details?.stravaId && !r.details.stravaDetail)
    .slice(-AUTO_DETAIL_RUNS);
  for (const r of newest) await loadStravaDetail(r.id, r.details!.stravaId!);

  return { ok: true, summary, found: activities.length };
}

/** Fetches splits, best efforts and streams for one run and stores them. */
export async function loadStravaDetail(runId: string, stravaId: number): Promise<boolean> {
  const res = await fetch(`/api/strava/activity/${stravaId}`).catch(() => null);
  if (!res?.ok) return false;
  const { details } = (await res.json()) as { details: RunDetails };
  updateRunDetails(runId, details);
  return true;
}
