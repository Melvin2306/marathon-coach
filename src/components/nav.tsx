"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";

const LINKS: { path: string; label: MessageKey }[] = [
  { path: "/", label: "nav.today" },
  { path: "/plan", label: "nav.plan" },
  { path: "/log", label: "nav.log" },
  { path: "/progress", label: "nav.progress" },
  { path: "/import", label: "nav.import" },
  { path: "/paces", label: "nav.paces" },
  { path: "/settings", label: "nav.settings" },
];

export function Nav() {
  const { t, href, locale } = useI18n();
  const pathname = usePathname();
  // Path without the locale prefix, e.g. "/plan".
  const current = pathname.slice(locale.length + 1) || "/";
  const activeRef = useRef<HTMLAnchorElement>(null);
  // On narrow screens the links scroll sideways; keep the active one visible.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
        <Link href={href("/")} className="mr-3 flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">42</span>
          <span className="hidden md:inline">Marathon Coach</span>
        </Link>
        <div className="flex flex-1 gap-1 overflow-x-auto">
          {LINKS.map(({ path, label }) => {
            const active = path === "/" ? current === "/" : current.startsWith(path);
            return (
              <Link
                key={path}
                ref={active ? activeRef : undefined}
                href={href(path)}
                className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition ${
                  active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t(label)}
              </Link>
            );
          })}
        </div>
        <Suspense fallback={<LanguageSwitcherShell locale={locale} />}>
          <LanguageSwitcher current={current} />
        </Suspense>
      </nav>
    </header>
  );
}

function LanguageSwitcher({ current }: { current: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const search = useSearchParams().toString();

  function switchTo(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/${next}${current === "/" ? "" : current}${search ? `?${search}` : ""}`);
  }

  return <LanguageSwitcherShell locale={locale} label={t("nav.language")} onSelect={switchTo} />;
}

function LanguageSwitcherShell({ locale, label, onSelect }: { locale: Locale; label?: string; onSelect?: (l: Locale) => void }) {
  return (
    <div role="group" aria-label={label} className="ml-2 flex shrink-0 rounded-lg border border-line p-0.5 text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={LOCALE_NAMES[l]}
          aria-pressed={l === locale}
          onClick={() => l !== locale && onSelect?.(l)}
          className={`rounded-md px-2 py-1 font-medium uppercase transition ${l === locale ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
