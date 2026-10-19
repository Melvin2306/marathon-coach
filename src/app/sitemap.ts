import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { languageAlternates, PAGES, SITE_URL } from "@/lib/site";

/** Every page in every language, each listing its translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path === "/" ? "" : path}`,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : path === "/paces" || path === "/plan" ? 0.8 : 0.5,
      alternates: {
        languages: Object.fromEntries(Object.entries(languageAlternates(path)).map(([l, p]) => [l, `${SITE_URL}${p}`])),
      },
    })),
  );
}
