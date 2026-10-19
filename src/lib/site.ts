// Brand and site-wide constants for metadata, icons and SEO.
import { LOCALES, type Locale } from "@/i18n/config";

export const SITE_NAME = "M42";
/** Fixed brand orange: the logo keeps it in light and dark mode. */
export const BRAND_COLOR = "#eb6834";
/** Production address; NEXT_PUBLIC_SITE_URL overrides it (e.g. for previews or local development). */
export const PRODUCTION_URL = "https://m42.rinkleff.dev";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "production" ? PRODUCTION_URL : "http://localhost:3000")).replace(/\/$/, "");

/** Public pages, without the locale prefix. */
export const PAGES = ["/", "/plan", "/progress", "/paces", "/log", "/import", "/settings", "/about", "/imprint", "/privacy"] as const;

/**
 * Strava account sync (OAuth, auto-sync, run details via the API). Off: Strava
 * data comes in through the archive upload instead. If you turn it back on,
 * restore the Strava and cookie sections in content/privacy.tsx.
 */
export const STRAVA_SYNC = false;

export const REPO_URL = "https://github.com/Melvin2306/marathon-coach";

/** Operator details for the imprint and privacy policy (same as rinkleff.dev). */
export const OPERATOR = {
  name: "Melvin Rinkleff",
  careOf: "c/o Langdock GmbH",
  street: "Greifswalder Str. 212",
  city: "10405 Berlin",
  country: { en: "Germany", de: "Deutschland" },
  email: "melvin.rinkleff@langdock.com",
  website: "https://rinkleff.dev",
  github: "https://github.com/Melvin2306",
} as const;

/** Date the legal texts were last reviewed. */
export const LEGAL_UPDATED = "2026-10-19";

export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", de: "de_DE" };

/** hreflang alternates for one page in every locale. */
export function languageAlternates(path: string): Record<string, string> {
  const suffix = path === "/" ? "" : path;
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}${suffix}`])),
    "x-default": `/en${suffix}`,
  };
}
