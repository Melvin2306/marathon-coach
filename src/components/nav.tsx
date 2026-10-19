"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { LogoMark, Wordmark } from "./logo";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";

type IconName = "today" | "plan" | "log" | "progress" | "import" | "paces" | "settings" | "more";

interface NavLink {
  path: string;
  label: MessageKey;
  icon: IconName;
}

// The first four are the phone's tab bar; the rest sit behind "More" there.
const LINKS: NavLink[] = [
  { path: "/", label: "nav.today", icon: "today" },
  { path: "/plan", label: "nav.plan", icon: "plan" },
  { path: "/log", label: "nav.log", icon: "log" },
  { path: "/progress", label: "nav.progress", icon: "progress" },
  { path: "/import", label: "nav.import", icon: "import" },
  { path: "/paces", label: "nav.paces", icon: "paces" },
  { path: "/settings", label: "nav.settings", icon: "settings" },
];
const TABS = LINKS.slice(0, 4);
const MORE = LINKS.slice(4);
const LEGAL: { path: string; label: MessageKey }[] = [
  { path: "/about", label: "legal.about" },
  { path: "/privacy", label: "legal.privacy" },
  { path: "/imprint", label: "legal.imprint" },
];

const isActive = (path: string, current: string) => (path === "/" ? current === "/" : current.startsWith(path));

export function Nav() {
  const { t, href, locale } = useI18n();
  const pathname = usePathname();
  // Path without the locale prefix, e.g. "/plan".
  const current = pathname.slice(locale.length + 1) || "/";
  return (
    <>
      {/* Safe-area padding keeps the header clear of the notch in landscape and in full-screen web apps. */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <Link href={href("/")} className="mr-3 flex shrink-0 items-center gap-2" aria-label="M42">
            <LogoMark size={28} />
            <Wordmark className="text-lg md:inline" />
          </Link>
          <div className="hidden flex-1 gap-1 md:flex">
            {LINKS.map(({ path, label }) => {
              const active = isActive(path, current);
              return (
                <Link
                  key={path}
                  href={href(path)}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {t(label)}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto">
            <Suspense fallback={<LanguageSwitcherShell locale={locale} />}>
              <LanguageSwitcher current={current} />
            </Suspense>
          </div>
        </nav>
      </header>
      <TabBar current={current} />
    </>
  );
}

/** Bottom tab bar on phones, like a native app; clears the home indicator. */
function TabBar({ current }: { current: string }) {
  const { t, href } = useI18n();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((l) => isActive(l.path, current)) || LEGAL.some((l) => isActive(l.path, current));

  // Close the sheet after navigating.
  const [shownFor, setShownFor] = useState(current);
  if (shownFor !== current) {
    setShownFor(current);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      {open && (
        <>
          <button type="button" aria-label={t("nav.close")} className="fixed inset-0 z-30 bg-black/30" onClick={() => setOpen(false)} />
          <div
            id="more-sheet"
            className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 mx-3 mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
          >
            <ul>
              {MORE.map(({ path, label, icon }) => (
                <li key={path} className="border-b border-line">
                  <Link
                    href={href(path)}
                    aria-current={isActive(path, current) ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 px-4 ${isActive(path, current) ? "font-medium text-accent" : "text-ink"}`}
                  >
                    <Icon name={icon} />
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-sm text-ink-2">
              {LEGAL.map(({ path, label }) => (
                <Link key={path} href={href(path)} className="py-1">
                  {t(label)}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur"
      >
        <ul className="grid grid-cols-5">
          {TABS.map(({ path, label, icon }) => {
            const active = isActive(path, current);
            return (
              <li key={path}>
                <Link href={href(path)} aria-current={active ? "page" : undefined} className={`flex h-15 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-medium text-accent" : "text-muted"}`}>
                  <Icon name={icon} />
                  {t(label)}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="more-sheet"
              onClick={() => setOpen((o) => !o)}
              className={`flex h-15 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${open || moreActive ? "font-medium text-accent" : "text-muted"}`}
            >
              <Icon name="more" />
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

const ICONS: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4m8-4v4" />
    </>
  ),
  log: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  progress: <path d="M3 20h18M6 16l4-5 3 3 5-7" />,
  import: <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
  paces: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l3.5-3.5M10 2h4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10m4 0h2M4 17h4m4 0h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
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
          className={`min-h-8 rounded-md px-2.5 py-1 font-medium uppercase transition ${l === locale ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
