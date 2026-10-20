// Demo mode: Max Mustermann, a recreational runner training for a sub-4-hour
// Berlin Marathon. A year of runs and daily health values is simulated as if
// imported from Apple Health: each run is generated as 5-second samples and
// goes through the same summariser and import path as a real export, so
// charts, zones and the fitness estimate behave exactly as with real data.
// Seeded, so the demo looks the same every time.
import { toActivity } from "./import/activity-files";
import { toRuns } from "./import/common";
import type { Sample } from "./import/samples";
import { addDays, daysBetween, mondayOf, parseISO, weekday } from "./dates";
import { deriveFitness, effectiveProfile } from "./fitness";
import { generatePlan } from "./plan";
import type { AppData } from "./store";
import { stepMeters, stepSeconds, workoutSteps } from "./treadmill";
import type { DailyValue, Plan, Profile, Run, Workout } from "./types";
import { HALF, oxygenCost, paceFor, predictTime } from "./vdot";

export const DEMO_NAME = "Max Mustermann";

const MAX_HR = 189;
const WEIGHT_KG = 76;
/**
 * Simulated fitness a year ago and today. Heart-rate estimates of easy running
 * read lower than this (cardiac drift), so the app shows about VDOT 40: a
 * realistic marathon of ~4:07 today, and ~3:58 on race day if he follows the
 * plan. Sub-4 is within reach, but not yet in the bag.
 */
const VDOT_START = 40.2;
const VDOT_NOW = 43.4;
/** Share of the year's improvement that came before the plan; structured training brings the rest. */
const GAIN_BEFORE_PLAN = 0.45;
/** The plan began this many weeks ago. */
const WEEKS_INTO_PLAN = 10;
const HISTORY_DAYS = 365;

function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The Berlin Marathon is run on a Sunday in late September; the last Sunday of the month stands in for it. */
export function nextBerlinMarathon(today: string): string {
  for (let year = Number(today.slice(0, 4)); ; year++) {
    let date = `${year}-09-30`;
    while (weekday(date) !== 6) date = addDays(date, -1);
    if (daysBetween(today, date) >= 8 * 7) return date;
  }
}

/** Berlin's typical weather by month: [°C, % humidity]. */
const BERLIN_WEATHER: [number, number][] = [
  [1, 85], [2, 80], [6, 74], [11, 64], [15, 64], [19, 65], [21, 65], [20, 67], [16, 74], [11, 81], [6, 85], [2, 86],
];

interface Segment {
  /** m/s */
  speed: number;
  seconds: number;
  /** flat speed with the same effort, for uphill reps (slower, but as hard as interval pace) */
  effortSpeed?: number;
}

/** A workout as running segments, using the same step model the treadmill programs use. */
function segmentsFor(workout: Pick<Workout, "type" | "distance" | "steps">, vdot: number): Segment[] {
  const blocks = workoutSteps(workout as Workout);
  if (!blocks) {
    // Races and time trials: an even effort at predicted race pace.
    return [{ speed: workout.distance / predictTime(vdot, workout.distance), seconds: predictTime(vdot, workout.distance) }];
  }
  const out: Segment[] = [];
  for (const b of blocks) {
    const steps = "repeat" in b ? b.steps : [b];
    for (let i = 0; i < ("repeat" in b ? b.repeat : 1); i++) {
      for (const s of steps) {
        const seconds = stepSeconds(s, vdot);
        if (seconds > 0) out.push({ speed: stepMeters(s, vdot) / seconds, seconds, effortSpeed: s.pace === "hill" ? 1000 / paceFor(vdot, "I") : undefined });
      }
    }
  }
  return out;
}

/** Heart rate a runner of this fitness settles at for a speed, via the same intensity mapping the app uses. */
function steadyHr(speed: number, vdot: number): number {
  const fraction = oxygenCost(speed * 60) / vdot;
  return Math.max(95, Math.min(MAX_HR - 2, (MAX_HR * (87.73 * fraction + 14.04)) / 100));
}

interface Simulated {
  samples: Sample[];
  seconds: number;
  meters: number;
}

/** 5-second samples: pace with small variations, lagging heart rate with drift, a flat Berlin route. */
function simulate(segments: Segment[], vdot: number, rnd: () => number): Simulated {
  const samples: Sample[] = [];
  const routePhase = rnd() * 10;
  let t = 0;
  let dist = 0;
  let hr = 92 + rnd() * 8;
  const form = 1 + (rnd() - 0.5) * 0.03; // a good or a heavy-legged day
  for (const seg of segments) {
    for (let s = 0; s < seg.seconds; s += 5) {
      const dt = Math.min(5, seg.seconds - s);
      const speed = seg.speed * form * (1 + (rnd() - 0.5) * 0.04 + 0.02 * Math.sin(dist / 700 + routePhase));
      dist += speed * dt;
      t += dt;
      const target = steadyHr((seg.effortSpeed ?? seg.speed) * (speed / seg.speed), vdot) + (t / 60) * 0.12; // cardiac drift
      // Heart rate rises faster than it falls.
      hr += (target - hr) * (1 - Math.exp(-dt / (target > hr ? 20 : 40))) + (rnd() - 0.5) * 1.5;
      hr = Math.min(hr, MAX_HR - 1);
      samples.push({
        t,
        dist,
        alt: 41 + 5 * Math.sin(dist / 1800 + routePhase) + 2.5 * Math.sin(dist / 420 + routePhase * 2) + (rnd() - 0.5) * 0.6,
        hr: Math.round(hr),
        // Cadence rises with speed; walking breaks are slower.
        cad: Math.round(speed < 1.8 ? 110 + rnd() * 10 : 150 + speed * 7 + (rnd() - 0.5) * 4),
      });
    }
  }
  return { samples: [{ t: 0, dist: 0, alt: samples[0]?.alt, hr: Math.round(hr) }, ...samples], seconds: t, meters: dist };
}

/** One run as Apple Health would deliver it. */
function appleRun(id: number, date: string, workout: Pick<Workout, "type" | "distance" | "steps">, vdot: number, plan: Plan | null, rnd: () => number): Run | null {
  const sim = simulate(segmentsFor(workout, vdot), vdot, rnd);
  const hour = workout.type === "long" || workout.type === "long-mp" || workout.type === "race" || weekday(date) >= 5 ? 8 + Math.floor(rnd() * 2) : 18 + Math.floor(rnd() * 2);
  const time = `${String(hour).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`;
  const month = parseISO(date).getUTCMonth();
  const [temperature, humidity] = BERLIN_WEATHER[month];
  const offset = month >= 3 && month <= 9 ? "+0200" : "+0100";
  const activity = toActivity(
    {
      source: "apple-health",
      start: Date.parse(`${date}T${time}:00${offset.slice(0, 3)}:${offset.slice(3)}`),
      sport: "running",
      totalDistance: sim.meters,
      totalSeconds: sim.seconds,
      calories: (sim.meters / 1000) * WEIGHT_KG * 0.95,
      device: "Max’s Apple Watch",
      id: `apple-health:${date} ${time}:00 ${offset}`,
      local: { date, time },
    },
    sim.samples,
  );
  if (!activity) return null;
  const speed = sim.meters / sim.seconds;
  activity.details = {
    ...activity.details,
    temperature: Math.round((temperature + (rnd() - 0.5) * 6) * 10) / 10,
    humidity: Math.round(humidity + (rnd() - 0.5) * 10),
    power: Math.round(WEIGHT_KG * speed * 1.04),
    strideLength: Math.round((speed / ((activity.details?.cadence ?? 170) / 60)) * 100) / 100,
    groundContact: Math.round(300 - speed * 18 + (rnd() - 0.5) * 10),
    verticalOscillation: Math.round((8.2 + (rnd() - 0.5) * 0.8) * 10) / 10,
  };
  const [run] = toRuns([activity], plan, "0000-00-00");
  return run ? { ...run, id: `demo-${id}` } : null;
}

/** Daily health values the watch would have recorded, improving slowly with training. */
function healthMetrics(today: string, rnd: () => number) {
  const restingHr: DailyValue[] = [];
  const hrv: DailyValue[] = [];
  const vo2max: DailyValue[] = [];
  for (let i = HISTORY_DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const progress = 1 - i / HISTORY_DAYS;
    // A rough week now and then: higher resting heart rate, lower HRV.
    const rough = rnd() < 0.06 ? 1 : 0;
    restingHr.push([date, Math.round(56 - 4 * progress + rough * 4 + (rnd() - 0.5) * 3)]);
    if (rnd() < 0.8) hrv.push([date, Math.round(42 + 9 * progress - rough * 10 + (rnd() - 0.5) * 12)]);
    if (i % 6 === 0) vo2max.push([date, Math.round((VDOT_START + 3 + (VDOT_NOW - VDOT_START) * progress + (rnd() - 0.5) * 0.6) * 10) / 10]);
  }
  return { restingHr, hrv, hrvRmssd: [], vo2max };
}

/** Everything the demo shows, as a full set of app data. */
export function demoData(today: string): AppData {
  const rnd = random(4242);
  const raceDate = nextBerlinMarathon(today);
  const planStart = addDays(mondayOf(today), -7 * WEEKS_INTO_PLAN);
  const gain = VDOT_NOW - VDOT_START;
  const vdotOn = (date: string) =>
    date < planStart
      ? VDOT_START + gain * GAIN_BEFORE_PLAN * (1 - daysBetween(date, planStart) / (HISTORY_DAYS - 7 * WEEKS_INTO_PLAN))
      : VDOT_START + gain * (GAIN_BEFORE_PLAN + (1 - GAIN_BEFORE_PLAN) * (daysBetween(planStart, date) / daysBetween(planStart, today)));
  const profile: Profile = {
    name: DEMO_NAME,
    raceName: "Berlin Marathon",
    raceDate,
    planStart,
    goalTime: 3 * 3600 + 59 * 60,
    // His half marathon in spring, kept as the manual fallback.
    recentRace: { distance: HALF, time: predictTime(VDOT_START + 0.8, HALF) },
    weeklyVolume: 30_000,
    longestRun: 15_000,
    daysPerWeek: 5,
    longRunDay: 6,
    experience: "returning",
    units: "km",
  };

  // Before the plan: four runs a week, building from ~28 to ~40 km.
  const runs: Run[] = [];
  let id = 0;
  for (let date = addDays(today, -HISTORY_DAYS); date < planStart; date = addDays(date, 1)) {
    const day = weekday(date);
    if (![1, 3, 4, 6].includes(day) || rnd() < 0.1) continue;
    const build = 1 - daysBetween(date, planStart) / HISTORY_DAYS;
    const km = day === 6 ? 10 + 6 * build + rnd() * 2 : 5.5 + 2.5 * build + rnd() * 1.5;
    const vdot = vdotOn(date);
    const run = appleRun(id++, date, { type: day === 6 ? "long" : "easy", distance: Math.round(km * 10) * 100, steps: [{ kind: "run", distance: Math.round(km * 10) * 100, pace: "E" }] }, vdot, null, rnd);
    if (run) runs.push(run);
  }

  // The plan as the app builds it from this history, then the runs done in it so far.
  const plan = generatePlan(effectiveProfile(profile, deriveFitness(runs, planStart, today)));
  for (const week of plan.weeks) {
    for (const w of week.workouts) {
      if (w.date >= today || w.date < planStart || w.type === "rest" || !w.distance) continue;
      // Life happens: about one planned run in twelve is skipped.
      if (rnd() < 0.08) continue;
      const run = appleRun(id++, w.date, w, vdotOn(w.date) * (w.type === "timetrial" ? 1.01 : 1), plan, rnd);
      if (!run) continue;
      // He rates hard sessions in the app after syncing.
      if (["tempo", "intervals", "timetrial", "long-mp", "hills"].includes(w.type)) run.rpe = 7 + Math.floor(rnd() * 2);
      runs.push(run);
    }
  }

  runs.sort((a, b) => a.date.localeCompare(b.date));
  return { profile, runs, health: healthMetrics(today, rnd), prefs: {}, demo: true };
}
