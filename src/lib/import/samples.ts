// One sample format for every activity source (FIT, GPX, TCX, Apple Health
// routes, Polar JSON...), and one summarizer, so all of them produce the same
// fields: totals, heart rate, cadence, elevation and 30-second series.
import { SERIES_STEP, type RunDetails } from "../types";

export interface Sample {
  /** seconds since the activity started */
  t: number;
  /** cumulative meters, when the source records it */
  dist?: number;
  lat?: number;
  lon?: number;
  /** meters */
  alt?: number;
  /** bpm */
  hr?: number;
  /** steps per minute (both feet) */
  cad?: number;
}

/** Elevation changes smaller than this are treated as GPS/barometer noise. */
const ELEVATION_HYSTERESIS = 2;
/** Altitude is averaged over this window first, so sample-to-sample jitter can't add up. */
const ELEVATION_SMOOTHING = 30;
/** Gaps longer than this (pauses) don't count as moving time. */
const PAUSE_GAP = 30;
/** Samples outside this window are corrupt timestamps (e.g. FIT's 0xFFFFFFFF), not part of the run. */
const MAX_SPAN = 48 * 3600;

const R = 6371008.8;
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Fills cumulative distance from GPS positions when the source has none (and has positions). */
export function withDistance(samples: Sample[]): Sample[] {
  if (samples.some((s) => s.dist !== undefined) || !samples.some((s) => s.lat !== undefined)) return samples;
  let total = 0;
  let prev: Sample | undefined;
  return samples.map((s) => {
    if (prev && s.lat !== undefined && s.lon !== undefined && prev.lat !== undefined && prev.lon !== undefined) {
      total += haversine(prev.lat, prev.lon, s.lat, s.lon);
    }
    if (s.lat !== undefined) prev = s;
    return { ...s, dist: total };
  });
}

/** Centered moving average of altitude over a time window (works for any sampling rate). */
export function smoothAltitudes(samples: { t: number; alt?: number }[], window = ELEVATION_SMOOTHING): number[] {
  const pts = samples.filter((s): s is { t: number; alt: number } => s.alt !== undefined && Number.isFinite(s.alt));
  const out: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (const p of pts) {
    while (hi < pts.length && pts[hi].t <= p.t + window / 2) sum += pts[hi++].alt;
    while (pts[lo].t < p.t - window / 2) sum -= pts[lo++].alt;
    out.push(sum / (hi - lo));
  }
  return out;
}

/** Total ascent with hysteresis, so remaining noise doesn't add up to fake climbing. */
export function elevationGain(altitudes: number[]): number {
  if (!altitudes.length) return 0;
  let gain = 0;
  let ref = altitudes[0];
  for (const a of altitudes) {
    if (a > ref + ELEVATION_HYSTERESIS) {
      gain += a - ref;
      ref = a;
    } else if (a < ref - ELEVATION_HYSTERESIS) {
      ref = a;
    }
  }
  return gain;
}

function bucketAverage(samples: Sample[], key: "hr" | "alt", buckets: number): number[] {
  const sum = new Float64Array(buckets);
  const n = new Uint32Array(buckets);
  for (const s of samples) {
    const v = s[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(s.t / SERIES_STEP)));
    sum[b] += v;
    n[b]++;
  }
  return Array.from(sum, (v, i) => (n[i] ? Math.round((v / n[i]) * 10) / 10 : 0));
}

/** Pace (s/km) per bucket from the distance covered in it; 0 when standing. */
function paceSeries(samples: Sample[], buckets: number): number[] {
  const first = new Array<Sample | undefined>(buckets);
  const last = new Array<Sample | undefined>(buckets);
  for (const s of samples) {
    if (s.dist === undefined) continue;
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(s.t / SERIES_STEP)));
    first[b] ??= s;
    last[b] = s;
  }
  return Array.from({ length: buckets }, (_, b) => {
    // Span from the previous bucket's last sample so each bucket covers a full step.
    let start: Sample | undefined;
    for (let k = b - 1; k >= 0 && !start; k--) start = last[k];
    start ??= first[b];
    const end = last[b];
    if (!start || !end || end.t <= start.t) return 0;
    const meters = (end.dist ?? 0) - (start.dist ?? 0);
    const speed = meters / (end.t - start.t);
    return speed > 0.5 ? Math.round(1000 / speed) : 0;
  });
}

export interface Summary {
  distance: number;
  /** moving seconds (pauses longer than 30 s removed) */
  duration: number;
  elapsed: number;
  avgHr?: number;
  maxHr?: number;
  details: RunDetails;
}

/** Totals and series from samples. Values the file states explicitly can override them. */
export function summarize(raw: Sample[]): Summary | null {
  const samples = withDistance(raw.filter((s) => Number.isFinite(s.t) && Math.abs(s.t) <= MAX_SPAN).sort((a, b) => a.t - b.t));
  if (samples.length < 2) return null;
  const elapsed = samples[samples.length - 1].t - samples[0].t;
  let moving = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= PAUSE_GAP) moving += dt;
  }
  const distances = samples.map((s) => s.dist).filter((d): d is number => d !== undefined);
  const distance = distances.length ? Math.max(...distances) - Math.min(...distances) : 0;
  const hrs = samples.map((s) => s.hr).filter((v): v is number => !!v && v > 0);
  const cads = samples.map((s) => s.cad).filter((v): v is number => !!v && v > 0);
  const alts = samples.map((s) => s.alt).filter((v): v is number => v !== undefined && Number.isFinite(v));
  // Series are aligned to the activity start (t = 0), which may precede the first sample.
  const buckets = Math.max(1, Math.ceil((Math.max(0, samples[samples.length - 1].t) + 1) / SERIES_STEP));

  const details: RunDetails = { elapsed: Math.round(elapsed) };
  if (hrs.length) details.hrSeries = bucketAverage(samples, "hr", buckets).map(Math.round);
  if (distances.length) details.paceSeries = paceSeries(samples, buckets);
  if (alts.length) {
    details.altitudeSeries = bucketAverage(samples, "alt", buckets);
    details.elevationGain = Math.round(elevationGain(smoothAltitudes(samples)));
  }
  if (cads.length) details.cadence = Math.round(cads.reduce((a, b) => a + b, 0) / cads.length);

  return {
    distance,
    duration: Math.round(moving),
    elapsed: Math.round(elapsed),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
    maxHr: hrs.length ? Math.max(...hrs) : undefined,
    details,
  };
}

/** Plausible running speed for files that don't say what sport they are (2:30–15:00 /km). */
export const looksLikeRun = (distance: number, seconds: number) => {
  const speed = distance / Math.max(1, seconds);
  return speed >= 1000 / 900 && speed <= 1000 / 150;
};
