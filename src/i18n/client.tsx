"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { translate, translatePlural, type FormatContext, type MessageKey, type Msg, type PluralKey } from "./translate";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => ({
      locale,
      t: (key: MessageKey, params?: Msg["params"], ctx?: FormatContext) => translate(locale, key, params, ctx),
      /** Renders a message produced by the plan or coach. */
      tm: (m: Msg, ctx?: FormatContext) => translate(locale, m.key, m.params, ctx),
      /** Count-aware message, e.g. "1 run" / "3 runs". */
      tn: (key: PluralKey, n: number, params?: Msg["params"]) => translatePlural(locale, key, n, params),
      /** Prefixes an app path with the current locale. */
      href: (path: string) => `/${locale}${path === "/" ? "" : path}`,
    }),
    [locale],
  );
}
