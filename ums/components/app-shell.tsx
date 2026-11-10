"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Check, ChevronDown, KeyRound, LayoutGrid, LogOut, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { approvalsItem, homeItem, moduleById, moduleOf, myModules, type ModuleId, type NavItem as BaseNavItem } from "@/lib/modules";
import { isDemo } from "@/lib/db";
import {
  getMyProfile, getSoldier, listChangeRequests, listIdApplications, listLeave, listNotices, loadCompanies, loadDirectory, loadLeaveTypes, loadSettings, loadTrainingTypes, signOut,
} from "@/lib/api";
import { ROLE_LABEL, missingProfileFields } from "@/lib/constants";
import { LangProvider, useI18n } from "@/lib/i18n";
import { SessionProvider, buildPerms, useSession, type SessionValue } from "@/lib/session";
import { bdToday, cls } from "@/lib/utils";
import { ToastProvider } from "./ui";
import { LiveClock, PortalLink, QuickSearch, ThemeToggle } from "./topbar-extras";
import { ModuleDenied } from "./module-bar";

type NavItem = BaseNavItem & { color?: string };
type NavGroup = { label: string; items: NavItem[] };

const PUBLIC_PATHS = ["/login", "/register"];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <ShellLoader>{children}</ShellLoader>
    </LangProvider>
  );
}

function ShellLoader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const router = useRouter();
  const { t } = useI18n();
  const [initial, setInitial] = useState<Parameters<typeof SessionProvider>[0]["initial"] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const isPublic = PUBLIC_PATHS.includes(path);

  const loader = useCallback(async (what: string[]) => {
    const out: Partial<SessionValue> = {};
    await Promise.all([
      what.includes("profile") && getMyProfile().then((p) => p && (out.profile = p)),
      what.includes("companies") && loadCompanies().then((v) => (out.companies = v)),
      what.includes("settings") && loadSettings().then((v) => (out.settings = v)),
      what.includes("leaveTypes") && loadLeaveTypes().then((v) => (out.leaveTypes = v)),
      what.includes("trainingTypes") && loadTrainingTypes().then((v) => (out.trainingTypes = v)),
      what.includes("directory") && loadDirectory().then((v) => (out.directory = v)),
    ]);
    return out;
  }, []);

  useEffect(() => {
    if (isPublic) return;
    let live = true;
    (async () => {
      try {
        const profile = await getMyProfile();
        if (!live) return;
        if (!profile) {
          // come back to the page that was asked for (e.g. a module opened from the portal)
          const want = window.location.pathname + window.location.search;
          return router.replace(path === "/dashboard" || path === "/" ? "/login" : `/login?next=${encodeURIComponent(want)}`);
        }
        if (!profile.active) {
          await signOut();
          return router.replace("/login?inactive=1");
        }
        const [companies, settings, leaveTypes, trainingTypes, directory] = await Promise.all([loadCompanies(), loadSettings(), loadLeaveTypes(), loadTrainingTypes(), loadDirectory()]);
        if (live) setInitial({ profile, companies, settings, leaveTypes, trainingTypes, directory });
      } catch (e) {
        if (live) setFailure(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [isPublic, router, path]);

  if (isPublic) return <ToastProvider>{children}</ToastProvider>;
  if (failure)
    return (
      <div className="auth-loading">
        <img src="/brand/logo-512.webp" alt="" className="splash-logo static" />
        <strong>{t("Could not load the system")}</strong>
        <span>{failure}</span>
        <button className="btn" onClick={() => signOut().then(() => router.replace("/login"))}>{t("Back to login")}</button>
      </div>
    );
  if (!initial)
    return (
      <Splash label={t("Verifying secure session…")} />
    );
  return (
    <SessionProvider initial={initial} loader={loader}>
      <ToastProvider>
        <Shell path={path}>{children}</Shell>
      </ToastProvider>
    </SessionProvider>
  );
}

/** Menu for the page being shown: Home lists the modules; inside a module only its own pages. */
function buildNav(perms: ReturnType<typeof buildPerms>, hasSoldier: boolean, approvals: number, current: ModuleId | "home"): NavGroup[] {
  const top: NavItem[] = [homeItem, ...(perms.canApproveAny ? [approvalsItem(approvals)] : [])];
  const mods = myModules(perms, hasSoldier);
  const mod = current === "home" ? undefined : mods.find((m) => m.id === current);
  if (!mod) return [{ label: "", items: top }, { label: "Modules", items: mods.map((m) => ({ href: m.items[0].href, label: m.label, icon: m.icon, color: m.color })) }];
  return [{ label: "", items: top }, { label: mod.label, items: mod.items }];
}

function Shell({ path, children }: { path: string; children: ReactNode }) {
  const router = useRouter();
  const { profile, perms, settings, companyById } = useSession();
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  // Desktop: the menu can shrink to an icon rail (remembered on this computer).
  // (the page loads already collapsed — see lib/theme.ts — so it does not jump on every load)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(document.documentElement.dataset.sidebar === "collapsed"), []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try { window.localStorage.setItem("ums-sidebar", next ? "collapsed" : "open"); } catch { /* ignore */ }
    setCollapsed(next);
  };
  const [approvals, setApprovals] = useState(0);
  const [newNotices, setNewNotices] = useState(0);

  useEffect(() => {
    if (profile.must_change_password && path !== "/change-password") router.replace("/change-password");
  }, [profile.must_change_password, path, router]);

  // A soldier must complete his personal information before using the system (first login).
  const [profileDone, setProfileDone] = useState(false);
  useEffect(() => {
    if (profileDone || profile.role !== "soldier" || !profile.soldier_id || profile.must_change_password) return;
    if (path === "/change-password" || path === "/complete-profile") return;
    let live = true;
    getSoldier(profile.soldier_id)
      .then((s) => {
        if (!live || !s) return;
        if (missingProfileFields(s as unknown as Record<string, unknown>).length) router.replace("/complete-profile");
        else setProfileDone(true);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [profileDone, profile.role, profile.soldier_id, profile.must_change_password, path, router]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const today = bdToday();
        const notices = await listNotices();
        if (live) setNewNotices(notices.filter((n) => n.publish_date <= today && n.publish_date >= today.slice(0, 8) + "01" && (!n.expiry_date || n.expiry_date >= today) && n.priority !== "Normal").length);
        if (!perms.canApproveAny) return;
        const p = perms;
        const [reqs, leave, apps] = await Promise.all([listChangeRequests({ status: "Pending" }), listLeave({ status: ["Applied", "Recommended"] }), p.isSuper ? listIdApplications("Pending") : Promise.resolve([])]);
        if (live) setApprovals(reqs.filter((r) => p.canReviewProfile(r.company_id)).length + leave.filter((l) => p.canDecideLeave(l.company_id, l.soldier_id)).length + apps.length);
      } catch {
        /* best effort */
      }
    };
    void tick();
    const timer = setInterval(tick, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [perms.canApproveAny, profile, path]);

  const current = moduleOf(path);
  const modules = useMemo(() => myModules(perms, !!profile.soldier_id), [perms, profile.soldier_id]);
  const currentDef = current === "home" ? undefined : modules.find((m) => m.id === current) ?? moduleById(current);
  const [switchOpen, setSwitchOpen] = useState(false);
  useEffect(() => setSwitchOpen(false), [path]);
  const groups = useMemo(() => buildNav(perms, !!profile.soldier_id, approvals, current), [perms, profile.soldier_id, approvals, current]);
  const mobileItems = current === "home" ? groups.flatMap((g) => g.items).slice(0, 4) : [homeItem, ...(groups[1]?.items.filter((i) => i.mobile) ?? [])].slice(0, 4);
  const isActive = (href: string) => path === href || (!["/dashboard", "/training"].includes(href) && path.startsWith(href + "/")) || (href === "/soldiers" && path.startsWith("/soldiers"));
  const initials = String(profile.full_name ?? "U").split(/\s+/).filter(Boolean).slice(-2).map((x) => x[0]).join("").toUpperCase();
  const roleLabel = `${t(ROLE_LABEL[profile.role])}${profile.company_id ? ` · ${companyById.get(profile.company_id)?.short_name ?? ""}` : ""}`;

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  const LangSwitch = (
    <div className="lang-switch" role="group" aria-label="Language">
      <button className={cls(lang === "en" && "on")} onClick={() => lang !== "en" && setLang("en")}>EN</button>
      <button className={cls(lang === "bn" && "on")} onClick={() => lang !== "bn" && setLang("bn")}>বাংলা</button>
    </div>
  );

  return (
    <div className={cls("app-shell", `role-${profile.role}`)}>
      {open && <button className="sidebar-backdrop no-print" onClick={() => setOpen(false)} aria-label="Close menu" />}
      <aside className={cls("sidebar no-print", open && "open")}>
        <div className="brand">
          <Link href="/dashboard" className="brand-mark" title={settings.unit.name}><img src="/brand/logo-160.webp" alt={settings.unit.name} /></Link>
          <div className="brand-text">
            <strong>{settings.unit.short}</strong>
            <span>{t("Unit Management System")}</span>
          </div>
          <button className="close-mobile icon-btn light" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="role-banner" title={collapsed ? `${profile.full_name ?? ""} · ${roleLabel}` : undefined}>
          <div className="avatar">{initials}</div>
          <div className="user-meta"><strong>{profile.appointment ?? profile.full_name ?? "User"}</strong><span>{profile.role !== "soldier" && (profile.held_by || profile.held_by_soldier) ? `${t("Held by")} ${profile.held_by ?? ""}` : roleLabel}</span></div>
        </div>
        <div className="module-switch">
          <button type="button" className={cls("module-current", switchOpen && "open")} style={{ ["--mod-c" as string]: currentDef?.color ?? "#7fa383" }} onClick={() => setSwitchOpen(!switchOpen)} aria-expanded={switchOpen} title={collapsed ? t(currentDef?.label ?? "All modules") : undefined}>
            <span className="module-ico">{currentDef ? <currentDef.icon size={16} /> : <LayoutGrid size={16} />}</span>
            <span className="module-txt"><small>{t("Module")}</small><strong>{t(currentDef?.label ?? "All modules")}</strong></span>
            <ChevronDown size={15} className="module-caret" />
          </button>
          {switchOpen && (
            <div className="module-menu" role="menu">
              <Link href="/dashboard" role="menuitem" className={cls("module-opt", current === "home" && "on")} style={{ ["--mod-c" as string]: "#7fa383" }} title={collapsed ? t("All modules") : undefined}>
                <span className="module-ico"><LayoutGrid size={15} /></span><span className="module-name">{t("All modules")}</span>{current === "home" && <Check size={14} />}
              </Link>
              {modules.map((m) => (
                <Link key={m.id} href={m.items[0].href} role="menuitem" className={cls("module-opt", current === m.id && "on")} style={{ ["--mod-c" as string]: m.color }} title={collapsed ? t(m.label) : undefined}>
                  <span className="module-ico"><m.icon size={15} /></span><span className="module-name">{t(m.label)}</span>{current === m.id && <Check size={14} />}
                </Link>
              ))}
            </div>
          )}
        </div>
        <nav className="nav-scroll">
          {groups.map((g, gi) => (
            <div key={gi} className="nav-group">
              {g.label && <div className={cls("nav-group-label", gi > 0 && currentDef && "module-label")} style={currentDef && gi > 0 ? { ["--mod-c" as string]: currentDef.color } : undefined}>{t(g.label)}</div>}
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={cls("nav-item", isActive(it.href) && "active")} title={collapsed ? t(it.label) : undefined}>
                    {it.color ? <i className="nav-mod-ico" style={{ background: it.color }}><Icon size={14} /></i> : <Icon size={17} />}
                    <span>{t(it.label)}</span>
                    {!!it.badge && <em className="nav-badge">{it.badge}</em>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system-status">
            <span className={cls("status-dot", isDemo && "demo")} />
            {isDemo ? t("Demo mode · data in this browser") : t("Connected")}
          </div>
          <div className="dev-credit">© BA 11108 Capt Asif Mahmud, Sigs</div>
          <button className="collapse-btn" onClick={() => toggleCollapsed()} title={collapsed ? t("Expand menu") : t("Collapse menu")} aria-label={collapsed ? t("Expand menu") : t("Collapse menu")}>
            {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>{t("Collapse menu")}</span></>}
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar no-print">
          <button className="icon-btn topbar-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <button className="icon-btn sidebar-toggle" onClick={() => toggleCollapsed()} title={collapsed ? t("Expand menu") : t("Collapse menu")} aria-label={collapsed ? t("Expand menu") : t("Collapse menu")}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
          <div className="topbar-brand"><img src="/brand/logo-160.webp" alt="" /><span>{settings.unit.short}</span></div>
          <div className="topbar-role"><span className={`role-chip role-chip-${profile.role}`}>{t(ROLE_LABEL[profile.role])}</span>{profile.company_id && <span className="muted small">{companyById.get(profile.company_id)?.name}</span>}</div>
          {perms.isStaff && <QuickSearch />}
          <span className="spacer" />
          <PortalLink compact />
          <LiveClock />
          {LangSwitch}
          <ThemeToggle />
          <Link href="/notices" className="icon-btn bell" aria-label="Notices"><Bell size={17} />{newNotices > 0 && <em>{newNotices}</em>}</Link>
          <Link href="/change-password" className="icon-btn" title={t("Change password")} aria-label="Change password"><KeyRound size={16} /></Link>
          <button className="icon-btn" onClick={logout} title={t("Sign out")} aria-label="Sign out"><LogOut size={16} /></button>
        </header>
        <main>{current !== "home" && !modules.some((m) => m.id === current) ? <ModuleDenied moduleId={current} /> : children}</main>
      </div>

      <nav className="bottom-nav no-print">
        {mobileItems.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={cls(isActive(it.href) && "active")}>
              <Icon size={19} />
              <span>{t(it.label)}</span>
              {!!it.badge && <em>{it.badge}</em>}
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)}><MoreHorizontal size={19} /><span>{t("More")}</span></button>
      </nav>
    </div>
  );
}

/** Full-screen loading view: crest with a turning ring and a moving bar. */
export function Splash({ label }: { label?: string }) {
  return (
    <div className="auth-loading" role="status" aria-live="polite">
      <div className="splash-crest">
        <span className="splash-ring" />
        <span className="splash-glow" />
        <img src="/brand/logo-512.webp" alt="" className="splash-logo" />
      </div>
      <strong className="splash-title">5 SIGNAL BATTALION</strong>
      <span className="splash-sub">Unit Management System</span>
      <div className="splash-bar"><i /></div>
      {label && <span className="splash-label">{label}</span>}
    </div>
  );
}
