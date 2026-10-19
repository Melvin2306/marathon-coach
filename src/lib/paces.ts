import { formatPace } from "./format";
import type { PaceKey, Units } from "./types";
import { easyRange, paceFor } from "./vdot";

export const PACE_KEYS: PaceKey[] = ["E", "M", "T", "I", "R"];

/** Target pace for a training intensity, e.g. "5:34/km" or "6:23–7:20/km" for easy. */
export function paceLabel(vdot: number, key: PaceKey, units: Units) {
  if (key === "E") {
    const [fast, slow] = easyRange(vdot);
    return `${formatPace(fast, units).split("/")[0]}–${formatPace(slow, units)}`;
  }
  return formatPace(paceFor(vdot, key), units);
}
