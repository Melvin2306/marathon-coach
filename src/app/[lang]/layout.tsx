import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { StravaAutoSync } from "@/components/strava-auto-sync";
import { I18nProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { resolveLocale, serverT } from "@/i18n/server";
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

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const t = serverT(await resolveLocale(params));
  return {
    title: { default: "Marathon Coach", template: "%s · Marathon Coach" },
    description: t("meta.description"),
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const locale = await resolveLocale(params);
  const t = serverT(locale);
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={locale}>
          <Nav />
          <StravaAutoSync />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
          <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted">{t("footer")}</footer>
        </I18nProvider>
      </body>
    </html>
  );
}
