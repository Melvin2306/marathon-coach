// Current fitness from recorded runs (Apple Health, Strava). When there are
// enough of them, they replace the numbers typed into Settings.
import { addDays, daysBetween } from "./dates";
import type { Profile, Run } from "./types";
import { HALF, predictTime, vdotFromHeartRate, vdotFromRace } from "./vdot";

/** Runs from the last 8 weeks describe current fitness. */
const FITNESS_WINDOW_DAYS = 56;
/** Max heart rate is taken from the last year of workouts. */
const MAX_HR_WINDOW_DAYS = 365;
const MIN_HR_RUNS = 3;

export interface DerivedFitness {
  /** null when no recorded run qualifies */
  vdot: number | null;
  method: "heart-rate" | "best-effort" | null;
  /** the fastest qualifying run: always a floor for the estimate */
  bestRun: Run | null;
  /** runs whose heart rate fed the estimate */
  hrRuns: number;
  maxHr: number | null;
  /** average weekly distance over the 4 weeks before the plan starts */
  weeklyVolume: number | null;
  /** longest run in the 30 days before the plan starts */
  longestRun: number | null;
}

const recorded = (runs: Run[]) => runs.filter((r) => r.source && r.source !== "manual");

/** A workout maximum this far above the next-highest is treated as a sensor spike. */
const SPIKE_RATIO = 1.08;

/**
 * Max heart rate: the highest workout maximum of the last year, unless it
 * stands more than 8% above the next one (a sensor spike); then the next one.
 */
export function observedMaxHr(runs: Run[], today: string): number | null {
  const maxima = recorded(runs)
    .filter((r) => r.maxHr && daysBetween(r.date, today) <= MAX_HR_WINDOW_DAYS)
    .map((r) => r.maxHr!)
    .sort((a, b) => b - a);
  if (maxima.length < 2) return null;
  return maxima[0] <= maxima[1] * SPIKE_RATIO ? maxima[0] : maxima[1];
}

export function deriveFitness(runs: Run[], planStart: string, today: string): DerivedFitness {
  const data = recorded(runs);
  const result: DerivedFitness = { vdot: null, method: null, bestRun: null, hrRuns: 0, maxHr: null, weeklyVolume: null, longestRun: null };
  if (!data.length) return result;

  // Baseline volume and longest run come from before the plan started, so the
  // plan stays stable as new runs are imported. For a start in the future, the
  // latest weeks up to today stand in. Requires history covering that window.
  const anchor = planStart < today ? planStart : today;
  const earliest = data[0].date;
  if (daysBetween(earliest, anchor) >= 21) {
    const before = (days: number) => data.filter((r) => r.date < anchor && r.date >= addDays(anchor, -days));
    result.weeklyVolume = before(28).reduce((s, r) => s + r.distance, 0) / 4;
    result.longestRun = Math.max(0, ...before(30).map((r) => r.distance));
  }

  const recent = data.filter((r) => {
    const age = daysBetween(r.date, today);
    return age >= 0 && age <= FITNESS_WINDOW_DAYS && !r.indoor && r.distance >= 3000 && r.duration >= 15 * 60;
  });
  if (!recent.length) return result;

  let best = recent[0];
  for (const r of recent) if (vdotFromRace(r.distance, r.duration) > vdotFromRace(best.distance, best.duration)) best = r;
  const bestVdot = vdotFromRace(best.distance, best.duration);
  result.bestRun = best;

  const maxHr = observedMaxHr(runs, today);
  const hrEstimates = maxHr
    ? recent.flatMap((r) => (r.avgHr ? [vdotFromHeartRate(r.distance, r.duration, r.avgHr, maxHr)] : [])).filter((v): v is number => v !== null)
    : [];

  if (maxHr && hrEstimates.length >= MIN_HR_RUNS) {
    hrEstimates.sort((a, b) => a - b);
    const median = hrEstimates[Math.floor(hrEstimates.length / 2)];
    result.vdot = Math.max(median, bestVdot);
    result.method = median >= bestVdot ? "heart-rate" : "best-effort";
    result.hrRuns = hrEstimates.length;
    result.maxHr = maxHr;
  } else {
    result.vdot = bestVdot;
    result.method = "best-effort";
  }
  return result;
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
