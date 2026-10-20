import "server-only";
// Strava OAuth for a local-first app: the token pair lives in an httpOnly
// cookie on the runner's own browser, and route handlers proxy API calls so
// the client secret never reaches the client.
import { NextResponse, type NextRequest } from "next/server";
import type { RawActivity } from "@/lib/import/common";
import { STRAVA_SYNC } from "@/lib/site";
import { SERIES_STEP, type RunDetails, type RunKind, type StravaAthlete } from "@/lib/types";

export const SESSION_COOKIE = "strava_session";
export const STATE_COOKIE = "strava_oauth_state";
const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

export interface StravaSession {
  accessToken: string;
  refreshToken: string;
  /** unix seconds */
  expiresAt: number;
  athlete: string;
  /** scopes the athlete granted, e.g. "read,activity:read_all,profile:read_all" */
  scope?: string;
}

export function stravaConfig() {
  if (!STRAVA_SYNC) return null;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function callbackUrl(request: NextRequest) {
  return new URL("/api/strava/callback", request.nextUrl.origin).toString();
}

export function readSession(request: NextRequest): StravaSession | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StravaSession;
  } catch {
    return null;
  }
}

export function writeSession(request: NextRequest, response: NextResponse, session: StravaSession) {
  response.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { firstname?: string; lastname?: string };
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const config = stravaConfig();
  if (!config) throw new Error("Strava is not configured");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status}`);
  return res.json();
}

export async function exchangeCode(code: string, scope: string): Promise<StravaSession> {
  const t = await requestToken({ code, grant_type: "authorization_code" });
  const athlete = [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at, athlete, scope };
}

/** Returns a session with a usable access token, refreshing it if it is about to expire. */
export async function freshSession(session: StravaSession): Promise<{ session: StravaSession; refreshed: boolean }> {
  if (session.expiresAt - 120 > Date.now() / 1000) return { session, refreshed: false };
  const t = await requestToken({ refresh_token: session.refreshToken, grant_type: "refresh_token" });
  return {
    session: { ...session, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at },
    refreshed: true,
  };
}

export class StravaAuthError extends Error {}

export class StravaScopeError extends Error {}

/** GET a Strava API path; maps 401 to StravaAuthError and 403 to StravaScopeError. */
async function stravaGet<T>(accessToken: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new StravaAuthError("Strava rejected the token");
  if (res.status === 403) throw new StravaScopeError("Missing Strava permission");
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  return res.json() as Promise<T>;
}

interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  workout_type?: number | null;
  average_heartrate?: number;
  max_heartrate?: number;
  trainer?: boolean;
  total_elevation_gain?: number;
  /** steps per minute of one foot for runs */
  average_cadence?: number;
  average_watts?: number;
  max_speed?: number;
  kudos_count?: number;
  pr_count?: number;
  achievement_count?: number;
  suffer_score?: number | null;
  map?: { summary_polyline?: string | null };
}

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
// Strava's workout_type for runs: 0 default, 1 race, 2 long run, 3 workout.
const WORKOUT_TYPE: Record<number, RunKind> = { 1: "race", 2: "long", 3: "workout" };
const PER_PAGE = 200;
const MAX_PAGES = 10;

const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;

export async function fetchRuns(accessToken: string, after: Date): Promise<RawActivity[]> {
  const runs: RawActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await stravaGet<StravaActivity[]>(accessToken, "/athlete/activities", {
      after: String(Math.floor(after.getTime() / 1000)),
      per_page: String(PER_PAGE),
      page: String(page),
    });
    for (const a of batch) {
      if (!RUN_TYPES.has(a.sport_type ?? a.type ?? "")) continue;
      runs.push({
        externalId: `strava:${a.id}`,
        source: "strava",
        date: a.start_date_local.slice(0, 10),
        distance: a.distance,
        duration: a.moving_time || a.elapsed_time,
        name: a.name,
        kindHint: a.workout_type ? (WORKOUT_TYPE[a.workout_type] ?? null) : null,
        avgHr: a.average_heartrate,
        maxHr: a.max_heartrate,
        indoor: a.trainer || a.sport_type === "VirtualRun" || undefined,
        details: defined({
          stravaId: a.id,
          name: a.name,
          startTime: a.start_date_local.slice(11, 16),
          elapsed: a.elapsed_time,
          elevationGain: a.total_elevation_gain !== undefined ? Math.round(a.total_elevation_gain) : undefined,
          cadence: a.average_cadence ? Math.round(a.average_cadence * 2) : undefined,
          power: a.average_watts ? Math.round(a.average_watts) : undefined,
          maxSpeed: a.max_speed,
          kudos: a.kudos_count,
          prs: a.pr_count,
          achievements: a.achievement_count,
          relativeEffort: a.suffer_score ?? undefined,
          polyline: a.map?.summary_polyline ?? undefined,
        }),
      });
    }
    if (batch.length < PER_PAGE) break;
  }
  return runs;
}

interface StravaDetailedActivity extends StravaActivity {
  calories?: number;
  description?: string | null;
  device_name?: string;
  gear?: { name?: string } | null;
  splits_metric?: { distance: number; moving_time: number; elevation_difference?: number; average_heartrate?: number }[];
  best_efforts?: { name: string; distance: number; moving_time: number; pr_rank?: number | null }[];
}

type Streams = Partial<Record<"time" | "heartrate" | "velocity_smooth" | "altitude", { data: number[] }>>;

/** Averages a stream into SERIES_STEP buckets by its time stream. */
function bucket(time: number[], values: number[] | undefined, map: (v: number) => number = (v) => v): number[] | undefined {
  if (!values?.length || values.length !== time.length) return undefined;
  const buckets = Math.ceil((time[time.length - 1] + 1) / SERIES_STEP);
  const sum = new Array<number>(buckets).fill(0);
  const n = new Array<number>(buckets).fill(0);
  time.forEach((t, i) => {
    const b = Math.floor(t / SERIES_STEP);
    sum[b] += values[i];
    n[b]++;
  });
  return sum.map((s, i) => (n[i] ? Math.round(map(s / n[i]) * 10) / 10 : 0));
}

/** Full detail for one activity: splits, best efforts, calories, shoe and 30-second streams. */
export async function fetchActivityDetail(accessToken: string, id: number): Promise<RunDetails> {
  const [a, streams] = await Promise.all([
    stravaGet<StravaDetailedActivity>(accessToken, `/activities/${id}`, { include_all_efforts: "false" }),
    stravaGet<Streams>(accessToken, `/activities/${id}/streams`, { keys: "time,heartrate,velocity_smooth,altitude", key_by_type: "true" }).catch(() => ({}) as Streams),
  ]);
  const time = streams.time?.data ?? [];
  return defined({
    stravaId: a.id,
    name: a.name,
    description: a.description ?? undefined,
    calories: a.calories ? Math.round(a.calories) : undefined,
    device: a.device_name,
    shoe: a.gear?.name,
    splits: a.splits_metric?.map((s) => defined({ distance: s.distance, time: s.moving_time, hr: s.average_heartrate ? Math.round(s.average_heartrate) : undefined, elevation: s.elevation_difference !== undefined ? Math.round(s.elevation_difference) : undefined })),
    bestEfforts: a.best_efforts?.map((e) => defined({ name: e.name, distance: e.distance, time: e.moving_time, prRank: e.pr_rank ?? undefined })),
    hrSeries: bucket(time, streams.heartrate?.data, Math.round),
    paceSeries: bucket(time, streams.velocity_smooth?.data, (v) => (v > 0.5 ? 1000 / v : 0)),
    altitudeSeries: bucket(time, streams.altitude?.data),
    stravaDetail: true,
  });
}

interface StravaAthleteResponse {
  id: number;
  firstname?: string;
  lastname?: string;
  profile_medium?: string;
  city?: string;
  shoes?: { id: string; name: string; distance: number; primary: boolean; retired?: boolean }[];
}

type Totals = { count: number; distance: number; moving_time: number; elevation_gain: number };
interface StravaStats {
  recent_run_totals: Totals;
  ytd_run_totals: Totals;
  all_run_totals: Totals;
}

const totals = (t: Totals) => ({ count: t.count, distance: t.distance, movingTime: t.moving_time, elevation: t.elevation_gain });

/** Profile, running totals and shoes (the last two need the profile:read_all scope). */
export async function fetchAthlete(accessToken: string, scope: string): Promise<StravaAthlete> {
  const a = await stravaGet<StravaAthleteResponse>(accessToken, "/athlete");
  const profileAccess = scope.includes("profile:read_all");
  const stats = await stravaGet<StravaStats>(accessToken, `/athletes/${a.id}/stats`).catch(() => null);
  return defined({
    name: [a.firstname, a.lastname].filter(Boolean).join(" "),
    avatar: a.profile_medium?.startsWith("http") ? a.profile_medium : undefined,
    city: a.city,
    totals: stats ? { recent: totals(stats.recent_run_totals), ytd: totals(stats.ytd_run_totals), all: totals(stats.all_run_totals) } : undefined,
    shoes: a.shoes?.filter((s) => !s.retired).map((s) => ({ id: s.id, name: s.name, distance: s.distance, primary: s.primary })),
    profileAccess,
  });
}

export async function deauthorize(accessToken: string) {
  await fetch("https://www.strava.com/oauth/deauthorize", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

/**
 * Runs `handler` with a fresh Strava session and turns failures into JSON
 * responses: 401 not-connected (the cookie is cleared), 403 missing-scope,
 * 502 when Strava is unavailable. A refreshed token is written back.
 */
/** While STRAVA_SYNC is off, every Strava route answers 404, so none of them is reachable. */
export function stravaDisabled(): NextResponse | null {
  return STRAVA_SYNC ? null : NextResponse.json({ error: "disabled" }, { status: 404 });
}

export async function withStrava(request: NextRequest, handler: (session: StravaSession) => Promise<unknown>): Promise<NextResponse> {
  if (!STRAVA_SYNC) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const stored = readSession(request);
  if (!stored) return NextResponse.json({ error: "not-connected" }, { status: 401 });
  try {
    const { session, refreshed } = await freshSession(stored);
    const response = NextResponse.json(await handler(session));
    if (refreshed) writeSession(request, response, session);
    return response;
  } catch (error) {
    if (error instanceof StravaAuthError) {
      const response = NextResponse.json({ error: "not-connected" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (error instanceof StravaScopeError) return NextResponse.json({ error: "missing-scope" }, { status: 403 });
    return NextResponse.json({ error: "strava-unavailable" }, { status: 502 });
  }
}
