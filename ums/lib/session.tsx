"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppSettings, Company, DirectoryEntry, LeaveType, Profile, Role, TrainingType } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { setExemptionRules } from "./compute";

/*
 * ROLE MODEL (mirrors supabase/schema.sql)
 *   Super admin  admin, co, 2ic, adjt -> everything, every company
 *   coy_comd     admin of OWN coy: approves leave & profile updates, coy plans, coy logins
 *   coy_rep      OWN coy operations: parade state, soldiers, training, leave on behalf
 *   bn_rep       BSM / Bn Daily: WHOLE unit view; full Bn parade state (all coys, accept/return, 2nd State) and duty roster
 *   clk          WHOLE unit: view & sort everything; edits personal info & training
 *   soldier      himself only (requests go to his Coy Comd)
 */
export interface Perms {
  role: Role;
  isSuper: boolean;
  isAdmin: boolean; // alias of isSuper
  isCommand: boolean; // alias of isSuper
  isUnitWide: boolean; // super + clerk
  isSoldier: boolean;
  isStaff: boolean; // anyone except an individual soldier
  isCoyComd: boolean;
  isCoyRep: boolean;
  isClerk: boolean;
  isBnRep: boolean;
  /** CO / 2IC / Adjt / Admin, Coy Comd, or an officer's own login (training photos) */
  isOfficer: boolean;
  /** leave-due suggestions: Coy Rep, Coy Comd, Bn Rep, CO, 2IC, Adjt, Admin */
  canSeeLeaveDue: boolean;
  /** leave this login is expected to decide (BHQ Pl and officers for Adjt / 2IC / CO; own coy for Coy Comd) */
  isMyLeaveToDecide: (companyId: string | null | undefined, soldierId: string | null | undefined) => boolean;
  /** sees every company (super, clerk, Bn Rep) */
  canViewAll: boolean;
  /** daily parade state lines of a company */
  canParadeCompany: (companyId: string | null | undefined) => boolean;
  /** duty roster of a company */
  canRosterCompany: (companyId: string | null | undefined) => boolean;
  /** accept / return coy states, edit after submission, start 2nd State */
  isParadeMaster: boolean;
  canParadeAny: boolean;
  canViewCompany: (companyId: string | null | undefined) => boolean;
  /** personnel & training records */
  canEditCompany: (companyId: string | null | undefined) => boolean;
  /** parade state, duty roster, leave on behalf, rejoin */
  canOperateCompany: (companyId: string | null | undefined) => boolean;
  /** approvals and coy programme / calendar / notices */
  canCommandCompany: (companyId: string | null | undefined) => boolean;
  canDecideLeave: (companyId: string | null | undefined, soldierId: string | null | undefined) => boolean;
  canReviewProfile: (companyId: string | null | undefined) => boolean;
  canPublishNotice: (companyId: string | null | undefined) => boolean;
  canApproveAny: boolean;
  canEditAnyCompany: boolean;
  canOperateAny: boolean;
  canManageUsers: boolean;
  canEditSettings: boolean;
  canEditUnitActivities: boolean;
  /** Officers' Desk module: Admin / CO / 2IC / Adjt, Coy Comd, and an individual officer */
  canOfficersDesk: boolean;
  /** daily commitments & training calendar of a coy (Clerk enters them on behalf of officers) */
  canPlanCompany: (companyId: string | null | undefined) => boolean;
  canFinalizeParade: boolean;
  canDeleteSoldier: boolean;
}

export function buildPerms(p: Profile | null, categoryOf?: (soldierId: string) => string | undefined, slugOf?: (companyId: string) => string | undefined): Perms {
  const isBhq = (cid: string | null | undefined) => !!cid && slugOf?.(cid) === "bhq";
  const officerSelf = !!p?.soldier_id && categoryOf?.(p.soldier_id) === "Offr";
  const role = (p?.role ?? "soldier") as Role;
  const coy = p?.company_id ?? null;
  const me = p?.soldier_id ?? null;
  // nobody decides his own leave — also not the person now holding this appointment login
  const self = (sid: string | null | undefined) => !!sid && (sid === me || sid === (p?.held_by_soldier ?? null));
  const isSuper = ["admin", "co", "2ic", "adjt"].includes(role);
  const isClerk = role === "clk";
  const isUnitWide = isSuper || isClerk;
  const isBnRep = role === "bn_rep";
  const canViewAll = isUnitWide || isBnRep;
  const coyStaff = (cid: string | null | undefined) => ["coy_comd", "coy_rep"].includes(role) && !!cid && cid === coy;
  const canCommand = (cid: string | null | undefined) => isSuper || (role === "coy_comd" && !!cid && cid === coy);
  return {
    role,
    isSuper,
    isOfficer: isSuper || role === "coy_comd" || officerSelf,
    isAdmin: isSuper,
    isCommand: isSuper,
    isUnitWide,
    isSoldier: role === "soldier",
    isStaff: role !== "soldier",
    isCoyComd: role === "coy_comd",
    isCoyRep: role === "coy_rep",
    isClerk,
    isBnRep,
    canViewAll,
    canParadeCompany: (cid) => isSuper || isBnRep || coyStaff(cid),
    canRosterCompany: (cid) => isSuper || isBnRep || coyStaff(cid),
    isParadeMaster: isSuper || isBnRep,
    canParadeAny: isSuper || isBnRep || ["coy_comd", "coy_rep"].includes(role),
    canViewCompany: (cid) => canViewAll || coyStaff(cid),
    canEditCompany: (cid) => isUnitWide || coyStaff(cid),
    canOperateCompany: (cid) => isSuper || coyStaff(cid),
    canCommandCompany: canCommand,
    // an officer's leave goes to Adjt / 2IC / CO; the Coy Comd decides JCO / OR leave of his coy
    // Coy Comd decides the JCO / OR leave of his coy; BHQ Pl and every officer's leave go to the Adjt (2IC / CO).
    // Adjt / 2IC / CO may still decide any leave when a Coy Comd is away.
    canDecideLeave: (cid, sid) => !self(sid) && (isSuper || (role === "coy_comd" && !!cid && cid === coy && !isBhq(cid) && (!sid || categoryOf?.(sid) !== "Offr"))),
    isMyLeaveToDecide: (cid, sid) => !self(sid) && (isSuper ? isBhq(cid) || (!!sid && categoryOf?.(sid) === "Offr") : role === "coy_comd" && !!cid && cid === coy && !isBhq(cid) && (!sid || categoryOf?.(sid) !== "Offr")),
    canSeeLeaveDue: isSuper || isBnRep || role === "coy_comd" || role === "coy_rep",
    canReviewProfile: canCommand,
    canPublishNotice: (cid) => isSuper || isClerk || (!!cid && canCommand(cid)),
    canApproveAny: isSuper || role === "coy_comd",
    canEditAnyCompany: isUnitWide || ["coy_comd", "coy_rep"].includes(role),
    canOperateAny: isSuper || ["coy_comd", "coy_rep"].includes(role),
    canManageUsers: isSuper || role === "coy_comd",
    canEditSettings: isSuper,
    canEditUnitActivities: isSuper || isClerk,
    canOfficersDesk: isSuper || role === "coy_comd" || (role === "soldier" && officerSelf),
    canPlanCompany: (cid) => isSuper || isClerk || (role === "coy_comd" && !!cid && cid === coy),
    canFinalizeParade: isSuper,
    canDeleteSoldier: isSuper,
  };
}

export interface SessionValue {
  profile: Profile;
  perms: Perms;
  companies: Company[];
  companyById: Map<string, Company>;
  settings: AppSettings;
  leaveTypes: LeaveType[];
  trainingTypes: TrainingType[];
  directory: DirectoryEntry[];
  directoryById: Map<string, DirectoryEntry>;
  /** Companies this user can see (own coy for coy staff). */
  myCompanies: Company[];
  reload: (what?: Array<"companies" | "settings" | "leaveTypes" | "trainingTypes" | "directory" | "profile">) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({
  initial,
  loader,
  children,
}: {
  initial: Omit<SessionValue, "perms" | "companyById" | "directoryById" | "myCompanies" | "reload">;
  loader: (what: string[]) => Promise<Partial<SessionValue>>;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const reload = useCallback(
    async (what: string[] = ["companies", "settings", "leaveTypes", "trainingTypes", "directory", "profile"]) => {
      const next = await loader(what);
      setState((s) => ({ ...s, ...next }));
    },
    [loader],
  );
  const value = useMemo<SessionValue>(() => {
    const cats = new Map(state.directory.map((d) => [d.id, d.category]));
    const slugs = new Map(state.companies.map((c) => [c.id, c.slug]));
    const perms = buildPerms(state.profile, (id) => cats.get(id), (id) => slugs.get(id));
    const active = state.companies.filter((c) => c.active);
    setExemptionRules({ ...DEFAULT_SETTINGS.training_exemption, ...(state.settings?.training_exemption ?? {}) });
    return {
      ...state,
      settings: { ...DEFAULT_SETTINGS, ...state.settings },
      perms,
      companyById: new Map(state.companies.map((c) => [c.id, c])),
      directoryById: new Map(state.directory.map((d) => [d.id, d])),
      myCompanies: perms.canViewAll ? active : active.filter((c) => c.id === state.profile.company_id),
      reload,
    };
  }, [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
