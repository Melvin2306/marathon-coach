import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Units } from "./types";

const MI = 1609.344;

export function unitLength(units: Units) {
  return units === "km" ? 1000 : MI;
}

export function formatDistance(meters: number, units: Units, digits = 1, locale: Locale = "en"): string {
  const value = meters / unitLength(units);
  return `${value.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: digits })} ${units}`;
}

/** Parses a user-typed decimal, accepting either "8.5" or "8,5". */
export function parseDecimal(input: string): number {
  return Number(input.trim().replace(",", "."));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Pace given in seconds per km, rendered in the chosen unit. */
export function formatPace(secPerKm: number, units: Units): string {
  const perUnit = units === "km" ? secPerKm : secPerKm * (MI / 1000);
  return `${formatClock(perUnit)}/${units}`;
}

/** Parses "h:mm:ss", "mm:ss" or plain minutes into seconds. */
export function parseClock(input: string): number | null {
  const parts = input.trim().split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] * 60;
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}
