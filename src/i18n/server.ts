import { notFound } from "next/navigation";
import { hasLocale, type Locale } from "./config";
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
