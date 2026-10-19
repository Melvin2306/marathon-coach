import { INTL_LOCALE, type Locale } from "@/i18n/config";

// All dates are ISO "YYYY-MM-DD" strings handled in UTC so arithmetic never
// drifts across DST changes. "Today" is the viewer's local calendar date.

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(iso: string): number {
  return (parseISO(iso).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }, locale: Locale = "en") {
  return parseISO(iso).toLocaleDateString(INTL_LOCALE[locale], { ...opts, timeZone: "UTC" });
}

/** Localised weekday name, 0 = Monday. */
export function weekdayName(day: number, locale: Locale, style: "long" | "short" = "long") {
  // 2024-01-01 was a Monday.
  return formatDate(addDays("2024-01-01", day), { weekday: style }, locale);
}
