// Turns a workout into a treadmill program: belt speed, incline and steps.
import type { StepBlock, StepPace, Units, Workout } from "./types";
import { easyRange, paceFor, predictTime } from "./vdot";

/**
 * Running incline. Without air resistance, a 1% grade best matches the
 * energy cost of running outdoors (Jones & Doust 1996, J Sports Sci), which
 * matters most at faster speeds.
 */
export const RUN_INCLINE = 1;
/** Hill repeats on the treadmill. */
export const HILL_INCLINE = 6;
const WALK_KMH = 5;
const MI = 1.609344;

/** Workouts that belong outdoors rather than on a belt. */
export const OUTDOOR_ONLY = new Set(["race", "tuneup"]);

/**
 * Belt speed at `grade` whose oxygen cost matches flat running at interval
 * pace: Daniels' cost equation plus the ACSM vertical term (0.9 · v · grade).
 */
function hillSpeedMetersPerMin(vdot: number, grade: number): number {
  const flat = 60_000 / paceFor(vdot, "I");
  const target = -4.6 + 0.182258 * flat + 0.000104 * flat * flat;
  const a = 0.000104;
  const b = 0.182258 + 0.9 * grade;
  const c = -4.6 - target;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

const kmhFromPace = (secPerKm: number) => 3600 / secPerKm;

/** Belt speed in km/h, or a [slow, fast] range for easy running. */
export function beltSpeed(pace: StepPace, vdot: number): number | [number, number] {
  switch (pace) {
    case "E": {
      const [fast, slow] = easyRange(vdot);
      return [kmhFromPace(slow), kmhFromPace(fast)];
    }
    case "steady":
      // Between the fast end of easy and marathon pace.
      return [kmhFromPace(easyRange(vdot)[0]), kmhFromPace(paceFor(vdot, "M"))];
    case "jog":
      return kmhFromPace(easyRange(vdot)[1]);
    case "walk":
      return WALK_KMH;
    case "hill":
      return (hillSpeedMetersPerMin(vdot, HILL_INCLINE / 100) * 60) / 1000;
    case "5K":
      return 5 * (3600 / predictTime(vdot, 5000));
    default:
      return kmhFromPace(paceFor(vdot, pace));
  }
}

export function inclineFor(pace: StepPace): number {
  if (pace === "hill") return HILL_INCLINE;
  if (pace === "walk") return 0;
  return RUN_INCLINE;
}

/** Speed in the runner's units, rounded to the 0.1 steps treadmills use. */
export function formatSpeed(speed: number | [number, number], units: Units, locale: string): string {
  const conv = (kmh: number) => (units === "mi" ? kmh / MI : kmh).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const unit = units === "mi" ? "mph" : "km/h";
  return Array.isArray(speed) ? `${conv(speed[0])}–${conv(speed[1])} ${unit}` : `${conv(speed)} ${unit}`;
}

/** The middle of a range: what to actually set. */
export const settingSpeed = (speed: number | [number, number]) => (Array.isArray(speed) ? (speed[0] + speed[1]) / 2 : speed);

/** Steps for a workout; simple runs are a single block at their distance. */
export function workoutSteps(w: Workout): StepBlock[] | null {
  if (w.steps) return w.steps;
  if (w.type === "rest" || w.type === "race" || w.distance === 0) return null;
  if (w.type === "strides") {
    return [
      { kind: "run", distance: w.distance, pace: "E" },
      { repeat: 6, steps: [{ kind: "work", seconds: 20, pace: "R" }, { kind: "recover", seconds: 60, pace: "walk" }] },
    ];
  }
  return [{ kind: "run", distance: w.distance, pace: "E" }];
}

/** Seconds for one step at its belt speed. */
export function stepSeconds(step: { distance?: number; seconds?: number; pace: StepPace }, vdot: number): number {
  if (step.seconds) return step.seconds;
  return ((step.distance ?? 0) / 1000 / settingSpeed(beltSpeed(step.pace, vdot))) * 3600;
}

export function stepMeters(step: { distance?: number; seconds?: number; pace: StepPace }, vdot: number): number {
  if (step.distance) return step.distance;
  return ((step.seconds ?? 0) / 3600) * settingSpeed(beltSpeed(step.pace, vdot)) * 1000;
}

/** Total time and distance of a program. */
export function programTotals(blocks: StepBlock[], vdot: number) {
  let seconds = 0;
  let meters = 0;
  for (const b of blocks) {
    const steps = "repeat" in b ? b.steps : [b];
    const n = "repeat" in b ? b.repeat : 1;
    for (const s of steps) {
      seconds += stepSeconds(s, vdot) * n;
      meters += stepMeters(s, vdot) * n;
    }
  }
  return { seconds, meters };
}
