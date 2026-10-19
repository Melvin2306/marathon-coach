export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

/** BCP 47 tag used for number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", de: "de-DE" };

export function hasLocale(value: string | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Picks the best supported locale from an Accept-Language header. */
export function matchAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...rest] = part.trim().split(";");
      const q = rest.find((p) => p.trim().startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.lang).find(hasLocale) ?? null;
}
