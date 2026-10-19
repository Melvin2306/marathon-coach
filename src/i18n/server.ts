import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { languageAlternates, OG_LOCALE, SITE_NAME } from "@/lib/site";
import { hasLocale, LOCALES, type Locale } from "./config";
import { translate, type MessageKey } from "./translate";

/** Resolves the `[lang]` param for Server Components, 404ing on unknown locales. */
export async function resolveLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return lang;
}

export function serverT(locale: Locale) {
  return (key: MessageKey) => translate(locale, key);
}

/**
 * Title, optional description, canonical URL and hreflang alternates for one
 * page. Metadata merges shallowly, so Open Graph and Twitter are complete here.
 */
export async function pageMetadata(params: Promise<{ lang: string }>, path: string, titleKey: MessageKey, descriptionKey?: MessageKey): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = serverT(locale);
  const title = t(titleKey);
  const description = descriptionKey ? t(descriptionKey) : undefined;
  const fullTitle = `${title} · ${SITE_NAME}`;
  // Setting openGraph/twitter here replaces the share image inherited from
  // [lang]/opengraph-image, so reference it explicitly.
  const images = [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: t("meta.title") }];
  const social = { title: fullTitle, ...(description ? { description } : {}), images };
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: `/${locale}${path}`, languages: languageAlternates(path) },
    openGraph: {
      ...social,
      type: "website",
      siteName: SITE_NAME,
      url: `/${locale}${path}`,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", ...social },
  };
}
