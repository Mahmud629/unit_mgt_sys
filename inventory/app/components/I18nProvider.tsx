"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  LANG_COOKIE,
  categoryLabel,
  conditionLabel,
  localDigits,
  statusLabel,
  translate,
  txnLabel,
  type Lang,
  type MsgKey,
} from "@/lib/i18n";

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
  /** Number or date text with Bangla digits when Bangla is on. */
  n: (value: string | number) => string;
  money: (value: number) => string;
  status: (value: string) => string;
  condition: (value: string) => string;
  category: (value: string) => string;
  txn: (value: string) => string;
  locale: string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    // Read by the server on the next page load so pages render in this language.
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      n: (v) => localDigits(v, lang),
      money: (v) => `৳${v.toLocaleString(lang === "bn" ? "bn-BD" : "en-IN")}`,
      status: (v) => statusLabel(v, lang),
      condition: (v) => conditionLabel(v, lang),
      category: (v) => categoryLabel(v, lang),
      txn: (v) => txnLabel(v, lang),
      locale: lang === "bn" ? "bn-BD" : "en-GB",
    }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
