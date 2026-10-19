import type { Msg } from "@/i18n/translate";

export type Units = "km" | "mi";

export type Experience = "first" | "returning" | "experienced";

export interface RaceResult {
  /** meters */
  distance: number;
  /** seconds */
  time: number;
}

export interface Profile {
  name: string;
  raceName: string;
  /** ISO date, YYYY-MM-DD */
  raceDate: string;
  /** ISO date the plan starts from (fixed when the profile is created) */
  planStart: string;
  /** goal marathon time in seconds, optional */
  goalTime: number | null;
  recentRace: RaceResult;
  /** current weekly volume in meters */
  weeklyVolume: number;
  /** longest run in the last month, meters */
  longestRun: number;
  daysPerWeek: 3 | 4 | 5 | 6;
  /** 0 = Monday ... 6 = Sunday */
  longRunDay: number;
  experience: Experience;
  units: Units;
}

export type RunKind = "easy" | "long" | "workout" | "race" | "other";

export type RunSource = "manual" | "strava" | "apple-health";

export interface Run {
  id: string;
  /** ISO date */
  date: string;
  /** meters */
  distance: number;
  /** seconds */
  duration: number;
  /** rate of perceived exertion, 1-10; null when imported without one */
  rpe: number | null;
  kind: RunKind;
  notes: string;
  source?: RunSource;
  /** stable id from the source, e.g. "strava:123", used to skip re-imports */
  externalId?: string;
  /** average and maximum heart rate (bpm), when the source recorded them */
  avgHr?: number;
  maxHr?: number;
  /** treadmill / indoor run: distance is estimated, so it's not used to judge fitness */
  indoor?: boolean;
  /** everything else the source recorded */
  details?: RunDetails;
}

/** Seconds per bucket in recorded time series. */
export const SERIES_STEP = 30;

export interface Split {
  /** meters */
  distance: number;
  /** seconds */
  time: number;
  hr?: number;
  /** meters gained (or lost, negative) */
  elevation?: number;
}

export interface BestEffort {
  name: string;
  distance: number;
  time: number;
  /** 1–3 when it was a personal record */
  prRank?: number;
}

export interface RunDetails {
  /** local start time, "HH:MM" */
  startTime?: string;
  /** seconds including pauses */
  elapsed?: number;
  /** meters climbed */
  elevationGain?: number;
  calories?: number;
  /** steps per minute */
  cadence?: number;
  /** watts */
  power?: number;
  /** meters */
  strideLength?: number;
  /** milliseconds */
  groundContact?: number;
  /** centimeters */
  verticalOscillation?: number;
  /** °C */
  temperature?: number;
  /** % */
  humidity?: number;
  /** m/s */
  maxSpeed?: number;
  device?: string;
  // Strava
  stravaId?: number;
  name?: string;
  description?: string;
  kudos?: number;
  prs?: number;
  achievements?: number;
  /** Strava's Relative Effort (heart-rate based training load) */
  relativeEffort?: number;
  shoe?: string;
  /** Google-encoded summary polyline of the route */
  polyline?: string;
  splits?: Split[];
  bestEfforts?: BestEffort[];
  /** average heart rate (bpm) per SERIES_STEP seconds; 0 where missing */
  hrSeries?: number[];
  /** pace (s/km) per SERIES_STEP seconds; 0 where stopped */
  paceSeries?: number[];
  /** altitude (m) per SERIES_STEP seconds */
  altitudeSeries?: number[];
  /** full Strava activity detail (splits, best efforts, streams) has been fetched */
  stravaDetail?: boolean;
}

/** [ISO date, value] */
export type DailyValue = [string, number];

/** Daily health metrics from Apple Health. */
export interface HealthMetrics {
  restingHr: DailyValue[];
  /** heart rate variability, SDNN in ms */
  hrv: DailyValue[];
  /** Apple's cardio fitness estimate, ml/kg/min */
  vo2max: DailyValue[];
}

export interface StravaAthlete {
  name: string;
  avatar?: string;
  city?: string;
  /** totals: last 4 weeks, year to date, all time */
  totals?: Record<"recent" | "ytd" | "all", { count: number; distance: number; movingTime: number; elevation: number }>;
  shoes?: { id: string; name: string; distance: number; primary: boolean }[];
  /** whether the connection includes profile access (shoes, totals) */
  profileAccess: boolean;
}

export type Phase = "base" | "build" | "specific" | "taper";

export type WorkoutType =
  | "rest"
  | "easy"
  | "strides"
  | "hills"
  | "fartlek"
  | "tempo"
  | "intervals"
  | "marathon"
  | "long"
  | "long-mp"
  | "tuneup"
  | "timetrial"
  | "race";

export type PaceKey = "E" | "M" | "T" | "I" | "R";

/** Target of a workout step: a training pace or a treadmill-specific effort. */
export type StepPace = PaceKey | "jog" | "walk" | "hill" | "5K" | "steady";

/** One programmable piece of a workout, by distance or time. */
export interface Step {
  kind: "warmup" | "run" | "work" | "recover" | "cooldown";
  /** meters */
  distance?: number;
  seconds?: number;
  pace: StepPace;
}

export type StepBlock = Step | { repeat: number; steps: Step[] };

export interface Workout {
  date: string;
  type: WorkoutType;
  title: Msg;
  description: Msg | null;
  /** meters, 0 for rest */
  distance: number;
  paces: PaceKey[];
  /** structure for sessions with intervals or pace changes; simple runs derive theirs from distance */
  steps?: StepBlock[];
}

export interface PlanWeek {
  index: number;
  /** ISO date of the Monday */
  start: string;
  phase: Phase;
  cutback: boolean;
  /** planned volume in meters */
  volume: number;
  /** fitness level the week's paces use: the schedule, held near the last race result */
  vdot: number;
  /** where the schedule toward the goal would put this week, once races confirm progress */
  scheduledVdot: number;
  focus: Msg;
  workouts: Workout[];
}

export interface Plan {
  weeks: PlanWeek[];
  currentVdot: number;
  goalVdot: number | null;
  /** realistic end point of the schedule: the goal, capped by a level-based improvement limit */
  targetVdot: number;
}
