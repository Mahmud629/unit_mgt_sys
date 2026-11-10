"use client";

// English / বাংলা language support.
//  - t("English text") returns the Bangla text when Bangla is selected.
//  - A small DOM pass translates whole static labels (headers, buttons) that
//    match the dictionary exactly, so every page follows the selected language.
//  - Personal names are shown from "Name (Bangla)" when it is recorded.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BN } from "./i18n-bn";

export type Lang = "en" | "bn";
const KEY = "ums-lang";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string, vars?: Record<string, string | number>) => string;
  nameOf: (s: { name: string; name_bn?: string | null }) => string;
}

const dict = new Map<string, string>(Object.entries(BN));
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

function translate(lang: Lang, en: string, vars?: Record<string, string | number>) {
  let out = lang === "bn" ? dict.get(en) ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

/** Usable outside React (e.g. in plain helpers). */
export function currentLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    return (window.localStorage.getItem(KEY) as Lang) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

const Ctx = createContext<I18n>({ lang: "en", setLang: () => undefined, t: (s) => s, nameOf: (s) => s.name });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => setLangState(currentLang()), []);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
    // Reload so every label (including ones translated in the DOM) switches cleanly.
    window.location.reload();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("lang-bn", lang === "bn");
    if (lang !== "bn") return;
    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") translateNode(m.target);
        m.addedNodes.forEach((n) => translateTree(n));
      }
    });
    translateTree(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (en, vars) => translate(lang, en, vars),
      nameOf: (s) => (lang === "bn" && s.name_bn ? s.name_bn : s.name),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

// ---------------------------------------------------------------- DOM pass
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);
function translateNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest("[data-no-translate]")) return;
  const raw = node.nodeValue ?? "";
  const key = raw.trim();
  if (!key || key.length > 160) return;
  const bn = dict.get(key);
  if (bn && bn !== key) node.nodeValue = raw.replace(key, bn);
}
function translateAttrs(el: Element) {
  for (const a of ["placeholder", "title", "aria-label"]) {
    const v = el.getAttribute(a);
    if (v) {
      const bn = dict.get(v.trim());
      if (bn) el.setAttribute(a, bn);
    }
  }
}
function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP.has(el.tagName) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
  translateAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateNode(n);
    else translateAttrs(n as Element);
    n = walker.nextNode();
  }
}
