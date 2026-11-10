"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Moon, Search, Sun } from "lucide-react";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";

import { THEME_KEY } from "@/lib/theme";

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { window.localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
    setThemeState(t);
  };
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = theme === "dark" ? t("Light mode") : t("Dark mode");
  return (
    <button type="button" className={`${className} theme-btn`} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/** Live Bangladesh date and time (Asia/Dhaka), ticking every second. */
export function LiveClock() {
  const { lang } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <div className="topbar-clock" />;
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const time = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const date = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Dhaka", weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(now);
  return (
    <div className="topbar-clock" aria-live="off" data-no-translate>
      <strong>{time}</strong>
      <span>{date}</span>
    </div>
  );
}

/** Find any soldier by Personal No, rank or name and open his file ("/" to focus). */
export function QuickSearch() {
  const { directory, companyById, perms } = useSession();
  const { t, nameOf } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const term = q.trim().toLowerCase().replace(/\s+/g, " ");
  const hits = useMemo(() => {
    if (term.length < 2) return [];
    const compact = term.replace(/\s/g, "");
    return directory
      .filter((s) => perms.canViewCompany(s.company_id))
      .filter((s) => s.snk_no.toLowerCase().replace(/\s/g, "").includes(compact) || `${s.rank} ${s.name} ${s.name_bn ?? ""}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [term, directory, perms]);
  const go = (id: string) => { setQ(""); setOpen(false); ref.current?.blur(); router.push(`/soldiers/view?id=${id}`); };
  return (
    <div className="qsearch" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <Search size={15} />
      <input ref={ref} className="input" value={q} placeholder={t("Find soldier…")} aria-label={t("Find soldier…")}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && hits[idx]) go(hits[idx].id);
          if (e.key === "Escape") { setQ(""); ref.current?.blur(); }
        }} />
      {!q && <kbd>/</kbd>}
      {open && term.length >= 2 && (
        <div className="qsearch-menu">
          {hits.length === 0 ? <div className="picker-empty">{t("No match")}</div> : hits.map((s, i) => (
            <button key={s.id} type="button" className={i === idx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); go(s.id); }}>
              <span className="mono">{s.snk_no}</span><strong>{s.rank} {nameOf(s)}</strong><small>{companyById.get(s.company_id)?.short_name}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "All systems" — back to the 5 SIG BN Unit Systems Portal; shown only when the portal is running. */
export function PortalLink({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_PORTAL_URL || `${window.location.protocol}//${window.location.hostname}:8080/`;
    if (window.location.port === "8080" && !process.env.NEXT_PUBLIC_PORTAL_URL) return; // this app is not under the portal
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    fetch(url, { mode: "no-cors", cache: "no-store", signal: ctl.signal }).then(() => setHref(url)).catch(() => undefined).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctl.abort(); };
  }, []);
  if (!href) return null;
  return (
    <a className={compact ? "icon-btn portal-link" : "btn btn-sm portal-link"} href={href} title={t("All systems")} aria-label={t("All systems")}>
      <LayoutGrid size={15} />{!compact && <span>{t("All systems")}</span>}
    </a>
  );
}
