import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCALES } from "@/i18n/config";
import { resolveLocale, serverT } from "@/i18n/server";
import { BRAND_COLOR } from "@/lib/site";

export const alt = "M42 · Marathon training coach";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Geist, the app's typeface, as TTF: next/og can't read the WOFF2 web fonts.
const fonts = Promise.all(
  (["Regular", "Bold"] as const).map(async (style) => ({
    name: "Geist",
    data: await readFile(join(process.cwd(), `src/assets/fonts/Geist-${style}.ttf`)),
    weight: style === "Bold" ? (700 as const) : (400 as const),
    style: "normal" as const,
  })),
);

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/** Share image: the mark, the wordmark, the tagline and what the app does, in the page's language. */
export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const t = serverT(await resolveLocale(params));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "80px 80px 110px", background: "#121211", color: "#f0efec", fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <svg width="150" height="150" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="15" fill={BRAND_COLOR} />
            <path d="M9 44L19.5 18L31 35L42.5 18L50 37" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="53.5" cy="44.5" r="4.6" fill="#fff" />
          </svg>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>
            M<span style={{ color: BRAND_COLOR }}>42</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -1.5 }}>{t("og.tagline")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {t("og.features")
              .split(" · ")
              .map((feature) => (
                <div key={feature} style={{ display: "flex", fontSize: 26, color: "#c3c2b7", padding: "8px 18px", border: "2px solid #2f2f2c", borderRadius: 999 }}>
                  {feature}
                </div>
              ))}
          </div>
        </div>
        {/* A course profile running along the bottom edge. */}
        <svg width="1200" height="70" viewBox="0 0 1200 70" style={{ position: "absolute", left: 0, bottom: 0 }}>
          <path d="M0 58 L180 40 L300 52 L470 20 L620 48 L780 14 L940 44 L1080 30 L1200 36" fill="none" stroke={BRAND_COLOR} strokeOpacity="0.4" strokeWidth="5" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size, fonts: await fonts },
  );
}
