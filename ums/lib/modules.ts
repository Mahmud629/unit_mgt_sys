// The UMS is one system with one login and one database, shown as separate modules.
// Each module has its own short menu; the portal opens a module directly (/go/?to=<id>).
// Every page a role could reach in the old single menu is in exactly one module here.
import {
  Activity, Award, BadgeCheck, Briefcase, CalendarCheck, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, Database, FileSpreadsheet, HeartPulse, Image as ImageIcon,
  KeyRound, LayoutDashboard, ListChecks, Megaphone, Bus, Repeat, Settings, ShieldCheck, Target, UserCircle, Users, type LucideIcon,
} from "lucide-react";
import type { buildPerms } from "./session";

type Perms = ReturnType<typeof buildPerms>;
export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number; mobile?: boolean };
export type ModuleId = "personnel" | "parade" | "training" | "officers" | "daily" | "admin";
export interface ModuleDef { id: ModuleId; label: string; icon: LucideIcon; color: string }

export const MODULES: ModuleDef[] = [
  { id: "personnel", label: "Soldiers' Database", icon: Database, color: "#2f6f9f" },
  { id: "parade", label: "Parade State & Leave", icon: ClipboardCheck, color: "#23806f" },
  { id: "training", label: "Training", icon: Target, color: "#b0702a" },
  { id: "officers", label: "Officers' Desk", icon: Briefcase, color: "#8a3a52" },
  { id: "daily", label: "Daily Activities", icon: CalendarClock, color: "#5a5aa8" },
  { id: "admin", label: "Administration", icon: Settings, color: "#56636e" },
];
export const moduleById = (id: string | null | undefined) => MODULES.find((m) => m.id === id);

/** Which module a page belongs to ("home" = dashboard, approvals and account pages). */
export function moduleOf(path: string): ModuleId | "home" {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const under = (base: string) => p === base || p.startsWith(base + "/");
  if (under("/soldiers") || under("/my-profile") || under("/admin/medical") || under("/admin/import")) return "personnel";
  if (under("/parade-state") || under("/leave")) return "parade";
  if (under("/training")) return "training";
  if (under("/daily/commitments") || under("/daily/officer-tasks")) return "officers";
  if (under("/daily") || under("/notices")) return "daily";
  if (under("/admin")) return "admin";
  return "home";
}

export const homeItem: NavItem = { href: "/dashboard", label: "Home", icon: LayoutDashboard, mobile: true };
export const approvalsItem = (badge: number): NavItem => ({ href: "/approvals", label: "Approvals", icon: BadgeCheck, badge, mobile: true });

/** The menu of one module for this login (empty = module not part of this login). */
export function moduleItems(id: ModuleId, perms: Perms, hasSoldier: boolean): NavItem[] {
  const myProfile: NavItem = { href: "/my-profile", label: "My Profile", icon: UserCircle, mobile: true };
  const photos: NavItem = { href: "/training/gallery", label: "Training Photos", icon: ImageIcon };
  const calendar: NavItem = { href: "/training/calendar", label: "Training Calendar", icon: CalendarDays, mobile: true };
  const courses: NavItem = { href: "/training/courses", label: "Courses & Cadres", icon: ClipboardList };
  const parade: NavItem = { href: "/parade-state", label: "Daily Parade State", icon: ClipboardCheck, mobile: true };

  switch (id) {
    case "personnel":
      if (perms.isSoldier) return [myProfile];
      if (perms.isBnRep) return [{ href: "/soldiers", label: "Soldiers Database", icon: Database, mobile: true }, ...(hasSoldier ? [myProfile] : [])];
      return [
        { href: "/soldiers", label: perms.canViewAll ? "Soldiers Database" : "Coy Soldiers", icon: Database, mobile: true },
        ...(hasSoldier ? [myProfile] : []),
        ...(perms.canEditAnyCompany ? [{ href: "/admin/medical", label: "Sick Report", icon: HeartPulse, mobile: true }] : []),
        ...(perms.isUnitWide || perms.canEditAnyCompany ? [{ href: "/admin/import", label: perms.isUnitWide ? "Import / Export" : "Upload soldiers (CSV)", icon: FileSpreadsheet }] : []),
      ];
    case "parade":
      if (perms.isClerk) return []; // the Clerk does not handle parade state or leave
      if (perms.isSoldier) return [{ href: "/leave", label: "My Leave", icon: Bus, mobile: true }];
      if (perms.isBnRep) return [parade, { href: "/leave", label: "Leave Register", icon: Bus, mobile: true }];
      return [parade, { href: "/leave", label: perms.canApproveAny || perms.canOperateAny ? "Leave" : "Leave Register", icon: Bus, mobile: true }];
    case "training":
      if (perms.isSoldier) return [{ href: "/training/my", label: "My Training", icon: Award, mobile: true }, calendar, ...(perms.isOfficer ? [photos] : [])];
      if (perms.isBnRep) return [{ href: "/training", label: "Training State", icon: Activity, mobile: true }, calendar, courses];
      return [
        { href: "/training", label: "Training State", icon: Activity, mobile: true },
        ...(perms.canEditAnyCompany ? [{ href: "/training/entry", label: "Record Results", icon: ListChecks, mobile: true }] : []),
        { href: "/training/cycle-plan", label: "Cycle Plan", icon: Repeat },
        calendar,
        courses,
        ...(perms.isOfficer ? [photos] : []),
      ];
    case "officers":
      if (!perms.canOfficersDesk) return [];
      return [
        { href: "/daily/commitments", label: "Officers' Daily Commitments", icon: CalendarCheck, mobile: true },
        { href: "/daily/officer-tasks", label: "Officers' Tasks", icon: ClipboardList, mobile: true },
      ];
    case "daily":
      return [
        { href: "/daily/programme", label: "Daily Commitments", icon: CalendarClock, mobile: true },
        { href: "/daily/duty-roster", label: "Duty Roster", icon: ShieldCheck, mobile: true },
        { href: "/notices", label: "Notices", icon: Megaphone, mobile: true },
      ];
    case "admin": {
      const out: NavItem[] = [];
      if (perms.canManageUsers) out.push({ href: "/admin/users", label: perms.isSuper ? "User Accounts" : "Coy Logins", icon: KeyRound, mobile: true });
      if (perms.canEditSettings) out.push({ href: "/admin/settings", label: "Settings", icon: Settings, mobile: true }, { href: "/admin/audit", label: "Audit Log", icon: Users, mobile: true });
      return out;
    }
  }
}

/** Modules this login can open, each with its menu. */
export function myModules(perms: Perms, hasSoldier: boolean) {
  return MODULES.map((m) => ({ ...m, label: perms.isSoldier && m.id === "parade" ? "Leave" : m.label, items: moduleItems(m.id, perms, hasSoldier) })).filter((m) => m.items.length > 0);
}
