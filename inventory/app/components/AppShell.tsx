"use client";

// Same frame as the Unit Management System (v3.4): navy sidebar with the crest,
// light top bar with the portal link, clock, language and theme, and the credit
// in the sidebar footer. On phones the menu becomes a bottom bar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "./I18nProvider";
import PortalLink from "./PortalLink";

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  register: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5M12 22V12" /></>,
  add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  collapse: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M16 15l-3-3 3-3" /></>,
  expand: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M14 9l3 3-3 3" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
};
function Icon({ name, size = 17 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// Own component so its updates re-render only the clock (Bangladesh time, like the UMS).
function Clock() {
  const { locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="topbar-clock" aria-hidden>
      <strong>{now ? now.toLocaleTimeString(locale, { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }) : " "}</strong>
      <span>{now ? now.toLocaleDateString(locale, { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", year: "numeric" }) : " "}</span>
    </div>
  );
}

// The theme lives on <html data-theme>; the inline script in layout.tsx sets
// it before the first paint, and this hook reads it back.
function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
function useTheme() {
  return useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light" as const
  );
}
function subscribeSidebar(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  return () => observer.disconnect();
}
function useCollapsed() {
  return useSyncExternalStore(subscribeSidebar, () => document.documentElement.dataset.sidebar === "collapsed", () => false);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const collapsed = useCollapsed();
  const [open, setOpen] = useState(false);
  const { t, lang, setLang } = useI18n();

  // Login and print pages have no frame.
  if (pathname === "/login" || pathname.startsWith("/print")) {
    return <>{children}</>;
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("inventory_theme", next);
    } catch {
      // storage unavailable; the theme still changes for this visit
    }
  }
  function toggleCollapsed() {
    const next = !collapsed;
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem("inventory_sidebar", next ? "collapsed" : "open");
    } catch {
      // ignore
    }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav: Array<{ href: string; label: string; icon: keyof typeof ICONS }> = [
    { href: "/", label: t("navDashboard"), icon: "dashboard" },
    { href: "/inventory", label: t("navRegister"), icon: "register" },
    { href: "/inventory?new=1", label: t("addItem"), icon: "add" },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : href.includes("?") ? false : pathname.startsWith(href));
  const themeLabel = theme === "light" ? t("darkMode") : t("lightMode");
  const collapseLabel = collapsed ? t("expandMenu") : t("collapseMenu");

  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <Link href="/" className="brand-mark" title={t("appName")} onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-512.webp" alt="5 Signal Battalion" />
          </Link>
          <div className="brand-text">
            <strong>5 SIG BN</strong>
            <span>{t("brandSub")}</span>
          </div>
          <button className="icon-btn light close-mobile" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" size={18} /></button>
        </div>
        <div className="role-banner" title={collapsed ? t("storeBanner") : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="avatar"><img src="/logo-mark.png" alt="" /></div>
          <div className="user-meta"><strong>{t("storeBanner")}</strong><span>{t("storeBannerSub")}</span></div>
        </div>
        <nav className="nav-scroll" aria-label="Main">
          <div className="nav-group">
            <div className="nav-group-label">{t("appSub")}</div>
            {nav.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`nav-item ${isActive(link.href) ? "active" : ""}`}
                aria-current={isActive(link.href) ? "page" : undefined} title={collapsed ? link.label : undefined}>
                <Icon name={link.icon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="system-status"><span className="status-dot" />{t("connectedLocal")}</div>
          <div className="dev-credit">© BA 11108 Capt Asif Mahmud, Sigs</div>
          <button className="collapse-btn" onClick={toggleCollapsed} title={collapseLabel} aria-label={collapseLabel}>
            <Icon name={collapsed ? "expand" : "collapse"} />{!collapsed && <span>{t("collapseMenu")}</span>}
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn topbar-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={19} /></button>
          <button className="icon-btn sidebar-toggle" onClick={toggleCollapsed} title={collapseLabel} aria-label={collapseLabel}><Icon name={collapsed ? "expand" : "collapse"} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="topbar-brand"><img src="/brand/logo-160.webp" alt="" /><span>5 SIG BN</span></div>
          <span className="role-chip">{t("storeChip")}</span>
          <span className="spacer" />
          <PortalLink label={t("allSystems")} className="icon-btn portal-link" />
          <Clock />
          <div className="lang-switch" role="group" aria-label="Language">
            <button type="button" className={lang === "en" ? "on" : ""} onClick={() => lang !== "en" && setLang("en")}>EN</button>
            <button type="button" className={lang === "bn" ? "on" : ""} onClick={() => lang !== "bn" && setLang("bn")}>বাংলা</button>
          </div>
          <button type="button" className="icon-btn" onClick={toggleTheme} title={themeLabel} aria-label={themeLabel}>
            <span suppressHydrationWarning style={{ display: "grid" }}><Icon name={theme === "light" ? "moon" : "sun"} /></span>
          </button>
          <button type="button" className="icon-btn" onClick={logout} title={t("logout")} aria-label={t("logout")}><Icon name="logout" size={16} /></button>
        </header>

        <main className="app-main">{children}</main>
      </div>

      <nav className="bottom-nav">
        {nav.map((link) => (
          <Link key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}>
            <Icon name={link.icon} size={19} />
            <span>{link.label}</span>
          </Link>
        ))}
        <button onClick={logout}><Icon name="logout" size={19} /><span>{t("logout")}</span></button>
      </nav>
    </div>
  );
}
