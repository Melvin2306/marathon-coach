// Jack Daniels' VDOT model: oxygen cost of running at a velocity, and the
// fraction of VO2max sustainable for a given duration.
import type { PaceKey } from "./types";

export const MARATHON = 42195;
export const HALF = 21097.5;

export const oxygenCost = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;

const sustainableFraction = (minutes: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);

/** VDOT from a race performance (meters, seconds). */
export function vdotFromRace(distance: number, seconds: number): number {
  const minutes = seconds / 60;
  const v = distance / minutes;
  return oxygenCost(v) / sustainableFraction(minutes);
}

/** Velocity (m/min) that costs the given VO2. */
function velocityForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted race time in seconds for a distance at a given VDOT. */
export function predictTime(vdot: number, distance: number): number {
  let lo = distance / 1000 * 120; // 2:00/km is faster than anyone
  let hi = distance / 1000 * 1200; // 20:00/km
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distance, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Fractions of VDOT, checked against the official VDOT O2 calculator:
// race times within 0.2% of Daniels' tables, M/T/I within ~1 s/km from VDOT 40.
const INTENSITY: Record<"T" | "I", number> = {
  T: 0.88,
  I: 0.975,
};

/** Training pace in seconds per km. */
export function paceFor(vdot: number, key: PaceKey): number {
  if (key === "M") return predictTime(vdot, MARATHON) / (MARATHON / 1000);
  // Daniels' R pace is I pace minus 6 s per 400 m (≈ mile race pace).
  if (key === "R") return paceFor(vdot, "I") - 15;
  if (key === "E") return easyRange(vdot)[0];
  return 60_000 / velocityForVo2(vdot * INTENSITY[key]);
}

/** Easy pace range matching the official calculator: 70% (fast end) to 62% (slow end) of VDOT. */
export function easyRange(vdot: number): [number, number] {
  return [60_000 / velocityForVo2(vdot * 0.7), 60_000 / velocityForVo2(vdot * 0.62)];
}

/**
 * Realistic marathon time for a recreational runner (Vickers & Vertosick 2016,
 * model 1, n = 2,303). Pure VDOT/Riegel predictions are well calibrated up to
 * the half marathon but too optimistic for the marathon, and more so at low
 * weekly mileage.
 */
export function realisticMarathon(raceDistance: number, raceSeconds: number, weeklyMeters: number): number {
  const riegelSpeed = MARATHON / (raceSeconds * Math.pow(MARATHON / raceDistance, 1.07));
  const milesPerWeek = weeklyMeters / 1609.344;
  const speed = 0.16018617 + 0.83076202 * riegelSpeed + 0.06423826 * (milesPerWeek / 10);
  return MARATHON / speed;
}

/**
 * Realistic VDOT gain over a full training cycle. Daniels advises raising VDOT
 * by at most ~1 point per 4–6 weeks, and gains shrink as runners get fitter.
 */
export function maxVdotGain(vdot: number): number {
  if (vdot < 35) return 6;
  if (vdot < 45) return 4;
  if (vdot < 55) return 3;
  return 2;
}

/**
 * VDOT implied by a run's pace and average heart rate, so easy runs count too,
 * not only all-out efforts. Heart rate maps to intensity with a linear fit
 * through Daniels' own zone anchors (E 65–79% HRmax ↔ 59–74%, T 88–92% ↔
 * 83–88%, I 98–100% ↔ 95–100%): %HRmax = 0.8773 · %VDOT + 14.04, within
 * 1.8 points of every anchor. (Lab-based equations such as Swain 1994 map to
 * measured VO2max, not to VDOT, and would overstate fitness by ~15–20% at
 * easy effort.) Returns null outside the zones the anchors cover.
 */
export function vdotFromHeartRate(distance: number, seconds: number, avgHr: number, maxHr: number): number | null {
  const percentHrMax = (avgHr / maxHr) * 100;
  const fraction = (percentHrMax - 14.04) / 0.8773 / 100;
  if (fraction < 0.59 || fraction > 1) return null;
  return oxygenCost(distance / (seconds / 60)) / fraction;
}
