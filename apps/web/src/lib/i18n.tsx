"use client";
// Lightweight EN/JA internationalisation. A `locale` cookie holds the choice; a client context
// serves it to client components; server components read the cookie directly (see i18n-server.ts).
// No external dependency. Strings live in messages.ts.
import { createContext, useContext, useCallback } from "react";
import { translate, type Locale, type MsgKey } from "./messages";

export type { Locale } from "./messages";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: MsgKey) => translate(locale, key), [locale]);
}

export function setLocaleCookie(locale: Locale) {
  // 1 year, site-wide.
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
