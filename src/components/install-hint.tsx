"use client";

import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";

const KEY = "m42:install-hint-dismissed";

/** iPhone/iPad Safari that isn't already running as a home-screen app. Safari has no install prompt, so we explain it. */
function shouldShow(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  if (!ios || nav.standalone || matchMedia("(display-mode: standalone)").matches) return false;
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
}

const noop = () => () => {};

export function InstallHint() {
  const { t } = useI18n();
  const eligible = useSyncExternalStore(noop, shouldShow, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!eligible || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private mode: it shows again next time.
    }
  }

  return (
    <aside
      aria-label={t("install.title")}
      className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mx-3 mb-2 rounded-2xl border border-line bg-surface p-4 text-sm shadow-xl md:bottom-4 md:left-auto md:mx-4 md:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("install.title")}</p>
          <p className="mt-1 text-ink-2">
            {t("install.steps.before")}{" "}
            <svg aria-label={t("install.share")} role="img" viewBox="0 0 24 24" className="inline size-4 -translate-y-0.5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>{" "}
            {t("install.steps.after")}
          </p>
          <p className="mt-1 text-xs text-muted">{t("install.data")}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t("nav.close")} className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink">
          <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
