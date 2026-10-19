import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { InstallHint } from "@/components/install-hint";
import { Nav } from "@/components/nav";
import { ServiceWorker } from "@/components/service-worker";
import { StravaAutoSync } from "@/components/strava-auto-sync";
import { I18nProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { resolveLocale, serverT } from "@/i18n/server";
import { languageAlternates, OG_LOCALE, REPO_URL, SITE_NAME, SITE_URL, STRAVA_SYNC } from "@/lib/site";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  // Lets the layout reach under the iPhone home indicator; safe-area insets keep content clear of it.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = serverT(locale);
  const title = t("meta.title");
  const description = t("meta.description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${SITE_NAME}` },
    description,
    applicationName: SITE_NAME,
    keywords: t("meta.keywords").split(", "),
    category: "sports",
    alternates: { canonical: `/${locale}`, languages: languageAlternates("/") },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `/${locale}`,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title, description },
    // Installed to the home screen, iOS opens it full screen; the status bar takes the theme color.
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
    formatDetection: { telephone: false },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const locale = await resolveLocale(params);
  const t = serverT(locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_URL}/${locale}`,
    description: t("meta.description"),
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    inLanguage: locale,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Phones get a bottom tab bar; reserve its height plus the home indicator. */}
      <body className="flex min-h-full flex-col pb-[calc(3.75rem+env(safe-area-inset-bottom))] font-sans md:pb-0">
        <I18nProvider locale={locale}>
          <Nav />
          {STRAVA_SYNC && <StravaAutoSync />}
          <main className="mx-auto w-full max-w-5xl flex-1 py-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-10">{children}</main>
          <InstallHint />
          <ServiceWorker />
          <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted">
            <nav className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-label={t("legal.footerNav")}>
              <Link href={`/${locale}/about`} className="hover:text-ink">
                {t("legal.about")}
              </Link>
              <Link href={`/${locale}/imprint`} className="hover:text-ink">
                {t("legal.imprint")}
              </Link>
              <Link href={`/${locale}/privacy`} className="hover:text-ink">
                {t("legal.privacy")}
              </Link>
              <a href={REPO_URL} className="hover:text-ink">
                GitHub
              </a>
            </nav>
            {t("footer")}
          </footer>
          <script
            type="application/ld+json"
            // Escape "<" so the JSON can't close the script tag.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
