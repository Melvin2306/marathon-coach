// Generates a periodised marathon plan from the runner's profile. The plan is
// a pure function of the profile, so it never needs to be stored.
import { msg, type Msg } from "@/i18n/translate";
import { addDays, daysBetween, mondayOf, weekday } from "./dates";
import type { PaceKey, Phase, Plan, PlanWeek, Profile, Step, StepBlock, Workout, WorkoutType } from "./types";
import { MARATHON, HALF, easyRange, maxVdotGain, paceFor, vdotFromRace } from "./vdot";

const KM = 1000;

// Peak weekly volume and long-run share follow published plans: Higdon Novice
// and Intermediate, Pfitzinger 18/55, and the low/middle-volume groups in
// Knopp et al. 2024 (92 plans, Sports Med Open), which peak at ~59 km with a
// ~30 km long run (~50% of the week).
const PEAK_VOLUME_KM: Record<Profile["daysPerWeek"], number> = { 3: 48, 4: 60, 5: 72, 6: 85 };
const MAX_LONG_SHARE: Record<Profile["daysPerWeek"], number> = { 3: 0.55, 4: 0.55, 5: 0.45, 6: 0.4 };
const EXPERIENCE_FACTOR: Record<Profile["experience"], number> = { first: 0.95, returning: 1, experienced: 1.15 };
/** Peak volume is also capped relative to where the runner starts (Higdon Novice: ~24 → 64 km)... */
const MAX_PEAK_MULTIPLE = 3;
/** ...without going below what a marathon realistically needs. */
const MIN_PEAK = 40 * KM;
/** Week-over-week growth, including the rebound after a cutback week (Higdon ~+20% max; Nielsen 2014 flags >30% over two weeks). */
const MAX_WEEKLY_GROWTH = 1.08;
/** No single run more than 10% longer than the longest of the previous 30 days (Frandsen et al. 2025, BJSM). */
const MAX_RUN_SPIKE = 1.1;
/** Long runs are capped by time as well as distance (Daniels: ~150 min; common coaching cap: ~3 h). */
const LONG_RUN_MINUTES: Record<Profile["experience"], number> = { first: 180, returning: 180, experienced: 210 };
/** ...but never below this, so slower runners still build race-specific endurance (with walk breaks if needed). */
const MIN_LONG_RUN_CAP = 26 * KM;
/** Hard sessions per week, counting marathon-pace long runs (pyramidal distributions keep ~75–80% easy). */
const MAX_QUALITY: Record<Profile["daysPerWeek"], number> = { 3: 1, 4: 2, 5: 2, 6: 2 };
const EASY_FLOOR = 3 * KM;

/** Slot layout as days after the long run. */
const LAYOUT: Record<Profile["daysPerWeek"], Record<number, Slot>> = {
  3: { 0: "long", 2: "q1", 4: "easy" },
  4: { 0: "long", 2: "q1", 4: "easy", 6: "easy" },
  5: { 0: "long", 2: "q1", 3: "easy", 4: "q2", 6: "easy" },
  6: { 0: "long", 1: "easy", 2: "q1", 3: "easy", 4: "q2", 6: "easy" },
};

type Slot = "long" | "q1" | "q2" | "easy";

/**
 * Training paces may run at most this far ahead of the last race result
 * (Daniels: raise VDOT ~1 point at a time, confirmed by performances).
 */
const UNCONFIRMED_VDOT_STEP = 1;
/** Fitness checks (5K time trials) every 8 weeks in base and build, e.g. weeks 6, 14, 22, 30. */
const FITNESS_CHECK_EVERY = 8;
const FITNESS_CHECK_FIRST = 5;

export const PHASES: Phase[] = ["base", "build", "specific", "taper"];

export function phaseLengths(totalWeeks: number) {
  const taper = totalWeeks >= 12 ? 3 : 2;
  const rest = totalWeeks - taper;
  const specific = Math.min(12, Math.max(4, Math.round(rest * 0.3)));
  const build = Math.min(10, Math.max(3, Math.round(rest * 0.3)));
  const base = Math.max(0, rest - specific - build);
  return { base, build, specific, taper };
}

const roundKm = (m: number) => Math.max(0, Math.round(m / KM) * KM);

export function generatePlan(profile: Profile): Plan {
  const firstMonday = mondayOf(profile.planStart);
  const raceMonday = mondayOf(profile.raceDate);
  const totalWeeks = daysBetween(firstMonday, raceMonday) / 7 + 1;
  const lengths = phaseLengths(totalWeeks);
  const buildStart = lengths.base;
  const specificStart = buildStart + lengths.build;
  const taperStart = specificStart + lengths.specific;

  const currentVdot = vdotFromRace(profile.recentRace.distance, profile.recentRace.time);
  const goalVdot = profile.goalTime ? vdotFromRace(MARATHON, profile.goalTime) : null;
  const targetVdot = goalVdot ? Math.min(Math.max(goalVdot, currentVdot), currentVdot + maxVdotGain(currentVdot)) : currentVdot;

  const startVolume = Math.max(profile.weeklyVolume, 5 * KM);
  const peakVolume = Math.min(
    Math.max(PEAK_VOLUME_KM[profile.daysPerWeek] * KM * EXPERIENCE_FACTOR[profile.experience], startVolume * 1.1),
    Math.max(startVolume * MAX_PEAK_MULTIPLE, MIN_PEAK),
  );
  const rampEnd = Math.max(1, specificStart + 3);

  const startLong = Math.max(profile.longestRun, 3 * KM);
  const maxLong = (profile.daysPerWeek === 3 ? 30 : profile.experience === "experienced" ? 35 : 32) * KM;
  const longPeakWeek = Math.max(1, taperStart - 3);

  const weeks: PlanWeek[] = [];
  let trend = startVolume;
  /** volume of the most recent full (non-cutback) training week */
  let lastFullWeek = startVolume;
  /** longest planned run per week, seeded with the runner's recent history */
  const longest: number[] = [];

  for (let i = 0; i < totalWeeks; i++) {
    const start = addDays(firstMonday, i * 7);
    const phase: Phase =
      i < buildStart ? "base" : i < specificStart ? "build" : i < taperStart ? "specific" : "taper";
    const inPhase = i - { base: 0, build: buildStart, specific: specificStart, taper: taperStart }[phase];
    const cutback = phase !== "taper" && i > 0 && (i + 1) % 4 === 0;
    const raceWeek = i === totalWeeks - 1;
    const tuneup = phase === "build" && i === specificStart - 1 && lengths.build >= 3;
    const fitnessCheck =
      (phase === "base" || phase === "build") && !cutback && !tuneup && i >= FITNESS_CHECK_FIRST && (i - FITNESS_CHECK_FIRST) % FITNESS_CHECK_EVERY === 0;

    if (phase !== "taper" && !cutback) {
      const linear = startVolume + (peakVolume - startVolume) * Math.min(1, i / rampEnd);
      // Never jump more than MAX_WEEKLY_GROWTH above the last full week, which also
      // keeps the week after a cutback from rebounding straight to the trend line.
      // (+2 km lets very low volumes grow at all, since runs come in whole kilometres.)
      trend = i === 0 ? startVolume : Math.min(peakVolume, linear, Math.max(lastFullWeek * MAX_WEEKLY_GROWTH, lastFullWeek + 2 * KM));
    }
    const taperIndex = i - taperStart;
    const volume = phase === "taper" ? trend * ([0.8, 0.6, 0.4][taperIndex] ?? 0.4) : cutback ? trend * 0.75 : trend;

    const progress = Math.min(1, i / Math.max(1, taperStart - 1));
    const scheduledVdot = currentVdot + (targetVdot - currentVdot) * progress;
    // Paces only move ahead of the latest race result by a small step; a
    // faster fitness check or race unlocks the rest of the schedule.
    const vdot = Math.min(scheduledVdot, currentVdot + UNCONFIRMED_VDOT_STEP);
    const tPace = paceFor(vdot, "T");

    // Long run: gradual distance progression, limited by share of the week, by
    // time on feet at easy pace, and by the 30-day single-run spike rule.
    const [easyFast, easySlow] = easyRange(vdot);
    const timeCap = Math.max(MIN_LONG_RUN_CAP, ((LONG_RUN_MINUTES[profile.experience] * 60) / ((easyFast + easySlow) / 2)) * KM);
    const recentLongest = Math.max(...longest.slice(-4), i < 4 ? startLong : 0);
    const longCapLinear = startLong + (maxLong - startLong) * Math.min(1, (i + 1) / longPeakWeek);
    let long = Math.min(longCapLinear, timeCap, recentLongest * MAX_RUN_SPIKE, volume * MAX_LONG_SHARE[profile.daysPerWeek]);
    if (cutback) long = Math.min(long, recentLongest * 0.75);
    if (phase === "taper") long = Math.min([24, 18, 0][taperIndex] * KM, timeCap, recentLongest);

    const workouts = buildWeek({
      profile,
      start,
      phase,
      inPhase,
      cutback,
      raceWeek,
      tuneup,
      fitnessCheck,
      taperIndex,
      volume,
      long: roundKm(long),
      tPace,
      iPace: paceFor(vdot, "I"),
      mPace: paceFor(vdot, "M"),
      easyKm: roundKm(Math.min(10 * KM, Math.max(4 * KM, (volume - long) / profile.daysPerWeek))),
    });
    longest.push(Math.max(0, ...workouts.filter((w) => w.type !== "race").map((w) => w.distance)));
    const planned = workouts.filter((w) => w.type !== "race").reduce((sum, w) => sum + w.distance, 0);
    if (phase !== "taper" && !cutback && workouts.length === 7) lastFullWeek = planned;

    weeks.push({
      index: i,
      start,
      phase,
      cutback,
      volume: planned,
      vdot,
      scheduledVdot,
      focus: msg(
        raceWeek ? "focus.raceWeek" : tuneup ? "focus.tuneup" : fitnessCheck ? "focus.fitnessCheck" : cutback ? "focus.cutback" : `phase.${phase}.focus`,
      ),
      workouts,
    });
  }

  return { weeks, currentVdot, goalVdot, targetVdot };
}

interface WeekContext {
  profile: Profile;
  start: string;
  phase: Phase;
  inPhase: number;
  cutback: boolean;
  raceWeek: boolean;
  tuneup: boolean;
  fitnessCheck: boolean;
  taperIndex: number;
  volume: number;
  long: number;
  tPace: number;
  iPace: number;
  mPace: number;
  /** typical easy-day distance this week */
  easyKm: number;
}

function buildWeek(ctx: WeekContext): Workout[] {
  const { profile, start } = ctx;
  const layout = LAYOUT[profile.daysPerWeek];
  const slots: (Slot | null)[] = Array.from({ length: 7 }, (_, day) => {
    const after = (day - profile.longRunDay + 7) % 7;
    return layout[after] ?? null;
  });

  const days: Workout[] = slots.map((slot, day) => {
    const date = addDays(start, day);
    if (!slot) return rest(date);
    if (slot === "long") return longRun(ctx, date);
    if (slot === "q1") return quality(ctx, date, 1);
    if (slot === "q2") return quality(ctx, date, 2);
    return easy(date, 0);
  });

  if (ctx.raceWeek) applyRaceWeek(ctx, days);
  else limitQuality(ctx, days, slots);

  // Spread the remaining planned volume across easy days.
  const easyDays = days.filter((w) => w.type === "easy" && w.distance === 0);
  if (easyDays.length) {
    const used = days.reduce((sum, w) => sum + w.distance, 0);
    const each = Math.min(16 * KM, Math.max(EASY_FLOOR, (ctx.volume - used) / easyDays.length));
    const distance = roundKm(ctx.raceWeek ? Math.min(each, 8 * KM) : each);
    for (const w of easyDays) {
      w.distance = distance;
      w.description = msg("w.easy.desc", { dist: { meters: distance } });
    }
  }
  if (!ctx.raceWeek) trimToVolume(ctx, days);

  return days.filter((w) => w.date >= profile.planStart);
}

const QUALITY_TYPES = new Set<WorkoutType>(["hills", "fartlek", "tempo", "intervals", "marathon", "long-mp", "tuneup", "timetrial"]);

/** Downgrades the second, then the first midweek session to easy + strides when a week has too many hard days. */
function limitQuality(ctx: WeekContext, days: Workout[], slots: (Slot | null)[]) {
  let hard = days.filter((w) => QUALITY_TYPES.has(w.type)).length;
  for (const slot of ["q2", "q1"] as const) {
    if (hard <= MAX_QUALITY[ctx.profile.daysPerWeek]) return;
    const day = slots.indexOf(slot);
    if (day >= 0 && QUALITY_TYPES.has(days[day].type)) {
      days[day] = strides(days[day].date, ctx.easyKm);
      hard--;
    }
  }
}

/**
 * Floors on easy and strides runs can push a low-volume week above its target.
 * Shorten easy runs first, then swap midweek sessions for easy + strides, and
 * only then turn the shortest runs into rest days.
 */
function trimToVolume(ctx: WeekContext, days: Workout[]) {
  const limit = Math.max(ctx.volume * 1.1, ctx.long + EASY_FLOOR);
  const total = () => days.reduce((sum, w) => sum + w.distance, 0);
  const flexible = () => days.filter((w) => w.type === "easy" || w.type === "strides");
  while (total() > limit) {
    const longestEasy = flexible().filter((w) => w.distance > EASY_FLOOR).sort((a, b) => b.distance - a.distance)[0];
    if (longestEasy) {
      longestEasy.distance -= KM;
      longestEasy.description =
        longestEasy.type === "strides" ? msg("w.strides.desc", { dist: dist(longestEasy.distance) }) : msg("w.easy.desc", { dist: dist(longestEasy.distance) });
      continue;
    }
    const midweek = days.find((w) => QUALITY_TYPES.has(w.type) && !["long-mp", "tuneup", "timetrial"].includes(w.type));
    if (midweek) {
      days[days.indexOf(midweek)] = strides(midweek.date, Math.min(midweek.distance, ctx.easyKm));
      continue;
    }
    const drop = flexible().sort((a, b) => a.distance - b.distance)[0];
    if (!drop) return;
    days[days.indexOf(drop)] = rest(drop.date);
  }
}

const dist = (meters: number) => ({ meters });

function workout(date: string, type: WorkoutType, title: Msg, description: Msg | null, distance: number, paces: PaceKey[], steps?: StepBlock[]): Workout {
  return { date, type, title, description, distance, paces, ...(steps ? { steps } : {}) };
}

const warmup = (distance = 2 * KM): Step => ({ kind: "warmup", distance, pace: "E" });
const cooldown = (distance = 2 * KM): Step => ({ kind: "cooldown", distance, pace: "E" });
const reps = (repeat: number, work: Step, recover: Step): StepBlock => ({ repeat, steps: [work, recover] });

const rest = (date: string) => workout(date, "rest", msg("w.rest"), msg("w.rest.desc"), 0, []);

const easy = (date: string, distance: number) => workout(date, "easy", msg("w.easy"), null, distance, ["E"]);

function longRun(ctx: WeekContext, date: string): Workout {
  const d = ctx.long;
  if (ctx.tuneup) {
    return workout(date, "tuneup", msg("w.tuneup"), msg("w.tuneup.desc"), roundKm(HALF + 3 * KM), ["E"]);
  }
  if (ctx.phase === "taper" && ctx.taperIndex === 0) {
    const easyPart = Math.max(0, (d - 8 * KM) / 2);
    return workout(date, "long-mp", msg("w.longMp"), msg("w.longMp.rehearsal", { dist: dist(d), mp: dist(8 * KM) }), d, ["E", "M"], [
      { kind: "run", distance: easyPart, pace: "E" },
      { kind: "work", distance: 8 * KM, pace: "M" },
      { kind: "run", distance: easyPart, pace: "E" },
    ]);
  }
  if (ctx.phase === "specific" && !ctx.cutback && ctx.inPhase % 2 === 1) {
    const mp = Math.min(16, 6 + Math.floor(ctx.inPhase / 2) * 2);
    return workout(date, "long-mp", msg("w.longMp"), msg("w.longMp.desc", { dist: dist(d), mp: dist(mp * KM) }), d, ["E", "M"], [
      { kind: "run", distance: Math.max(0, d - mp * KM), pace: "E" },
      { kind: "work", distance: mp * KM, pace: "M" },
    ]);
  }
  const key =
    ctx.phase === "specific" ? "w.long.desc.fuel" : ctx.phase === "build" && !ctx.cutback ? "w.long.desc.steady" : "w.long.desc";
  if (key === "w.long.desc.steady") {
    // The final 15 minutes, at most marathon pace.
    const steady = roundKm(((15 * 60) / ctx.mPace) * KM);
    return workout(date, "long", msg("w.long"), msg(key, { dist: dist(d) }), d, ["E"], [
      { kind: "run", distance: Math.max(0, d - steady), pace: "E" },
      { kind: "work", seconds: 15 * 60, pace: "steady" },
    ]);
  }
  return workout(date, "long", msg("w.long"), msg(key, { dist: dist(d) }), d, ["E"]);
}

const BASE_SEQUENCE: WorkoutType[] = ["strides", "strides", "hills", "fartlek"];

const TEMPO = [
  { reps: 3, each: 8, jog: 2 },
  { reps: 4, each: 8, jog: 2 },
  { reps: 3, each: 10, jog: 2 },
  { reps: 2, each: 15, jog: 3 },
  { reps: 1, each: 20, jog: 0 },
  { reps: 4, each: 10, jog: 2 },
  { reps: 3, each: 12, jog: 2 },
  { reps: 1, each: 25, jog: 0 },
];

const INTERVALS = [
  { reps: 5, length: 1000 },
  { reps: 6, length: 800 },
  { reps: 4, length: 1200 },
  { reps: 6, length: 1000 },
  { reps: 5, length: 1200 },
  { reps: 4, length: 1600 },
];

function quality(ctx: WeekContext, date: string, slot: 1 | 2): Workout {
  const { phase, inPhase, cutback } = ctx;
  const warm = 4 * KM;

  if (ctx.tuneup) return strides(date, ctx.easyKm);
  if (ctx.fitnessCheck && slot === 1) {
    // 5 km plus warm-up and cool-down, kept within the runner's recent longest run.
    const total = Math.min(9 * KM, Math.max(7 * KM, ctx.long));
    const easyPart = (total - 5 * KM) / 2;
    return workout(date, "timetrial", msg("w.timetrial"), msg("w.timetrial.desc"), total, ["E"], [warmup(easyPart), { kind: "work", distance: 5 * KM, pace: "5K" }, cooldown(easyPart)]);
  }
  if (phase === "taper") {
    if (slot === 2) return easy(date, 0);
    if (ctx.taperIndex === 0) return tempo(ctx, date, TEMPO[2]);
    return workout(date, "marathon", msg("w.sharpener"), msg("w.sharpener.desc"), 10 * KM, ["E", "M"], [
      warmup(),
      reps(3, { kind: "work", distance: 2 * KM, pace: "M" }, { kind: "recover", seconds: 120, pace: "jog" }),
      cooldown(),
    ]);
  }
  if (cutback) return slot === 1 ? strides(date, ctx.easyKm) : easy(date, 0);

  if (phase === "base") {
    if (slot === 2) return strides(date, ctx.easyKm);
    const kind = BASE_SEQUENCE[inPhase % BASE_SEQUENCE.length];
    const level = Math.min(6, Math.floor(inPhase / 4));
    if (kind === "hills") {
      return workout(date, "hills", msg("w.hills"), msg("w.hills.desc", { reps: 6 + level }), roundKm(warm + (6 + level) * 400), ["E"], [
        warmup(),
        reps(6 + level, { kind: "work", seconds: 60, pace: "hill" }, { kind: "recover", seconds: 90, pace: "jog" }),
        cooldown(),
      ]);
    }
    if (kind === "fartlek") {
      return workout(date, "fartlek", msg("w.fartlek"), msg("w.fartlek.desc", { reps: 6 + level }), roundKm(warm + (6 + level) * 3 * 60 / (ctx.tPace * 1.05) * KM), ["E", "T"], [
        warmup(),
        reps(6 + level, { kind: "work", seconds: 120, pace: "T" }, { kind: "recover", seconds: 60, pace: "jog" }),
        cooldown(),
      ]);
    }
    return strides(date, ctx.easyKm);
  }

  // Build: threshold first, intervals second. With only one quality day, alternate.
  const useIntervals = slot === 2 || (ctx.profile.daysPerWeek <= 4 && inPhase % 2 === 1);
  if (phase === "build") {
    if (useIntervals) {
      const set = INTERVALS[Math.min(INTERVALS.length - 1, Math.floor(inPhase / (slot === 2 ? 1 : 2)))];
      // Recovery jogs last as long as the rep, covering ~70% of its distance at easy pace.
      const repSeconds = Math.round((ctx.iPace * set.length) / KM);
      return workout(date, "intervals", msg("w.intervals"), msg("w.intervals.desc", { reps: set.reps, length: set.length }), roundKm(warm + set.reps * set.length * 1.7), ["E", "I"], [
        warmup(),
        reps(set.reps, { kind: "work", distance: set.length, pace: "I" }, { kind: "recover", seconds: repSeconds, pace: "jog" }),
        cooldown(),
      ]);
    }
    return tempo(ctx, date, TEMPO[Math.min(TEMPO.length - 1, Math.floor(inPhase / (ctx.profile.daysPerWeek <= 4 ? 2 : 1)))]);
  }

  // Marathon-specific.
  if (slot === 2 || (ctx.profile.daysPerWeek <= 4 && inPhase % 2 === 0)) {
    const mp = Math.min(16, 8 + inPhase);
    return workout(date, "marathon", msg("w.mp"), msg("w.mp.desc", { mp: dist(mp * KM) }), (mp + 3) * KM, ["E", "M"], [
      warmup(),
      { kind: "work", distance: mp * KM, pace: "M" },
      cooldown(KM),
    ]);
  }
  return tempo(ctx, date, TEMPO[Math.min(TEMPO.length - 1, 3 + Math.floor(inPhase / 2))]);
}

function strides(date: string, distance: number): Workout {
  return workout(date, "strides", msg("w.strides"), msg("w.strides.desc", { dist: dist(distance) }), distance, ["E", "R"]);
}

function tempo(ctx: WeekContext, date: string, set: (typeof TEMPO)[number]): Workout {
  const main = ((set.reps * set.each * 60) / ctx.tPace) * KM;
  const description =
    set.reps === 1 ? msg("w.tempo.continuous", { min: set.each }) : msg("w.tempo.desc", { reps: set.reps, min: set.each, jog: set.jog });
  const work: Step = { kind: "work", seconds: set.each * 60, pace: "T" };
  const steps: StepBlock[] = [warmup(), set.reps === 1 ? work : reps(set.reps, work, { kind: "recover", seconds: set.jog * 60, pace: "jog" }), cooldown()];
  return workout(date, "tempo", msg("w.tempo"), description, roundKm(4 * KM + main + (set.reps - 1) * 300), ["E", "T"], steps);
}

function applyRaceWeek(ctx: WeekContext, days: Workout[]) {
  const raceDay = weekday(ctx.profile.raceDate);
  for (let day = 0; day < 7; day++) {
    const date = days[day].date;
    if (day === raceDay) {
      const title = ctx.profile.raceName ? msg("w.race.named", { name: ctx.profile.raceName }) : msg("w.race");
      days[day] = workout(date, "race", title, msg("w.race.desc"), MARATHON, ["M"]);
    } else if (day > raceDay) {
      days[day] = workout(date, "rest", msg("w.recover"), msg("w.recover.desc"), 0, []);
    } else if (day === raceDay - 1) {
      days[day] = workout(date, "easy", msg("w.shakeout"), msg("w.shakeout.desc"), 3 * KM, ["E"]);
    } else if (days[day].type === "rest") {
      continue;
    } else if (raceDay - day >= 4 && days[day].type !== "easy") {
      days[day] = workout(date, "marathon", msg("w.raceWeekTuneup"), msg("w.raceWeekTuneup.desc"), 7 * KM, ["E", "M"], [
        warmup(),
        reps(3, { kind: "work", distance: KM, pace: "M" }, { kind: "recover", seconds: 120, pace: "jog" }),
        cooldown(KM),
      ]);
    } else {
      days[day] = easy(date, 0);
    }
  }
}
