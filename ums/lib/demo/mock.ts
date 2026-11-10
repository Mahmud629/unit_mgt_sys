/* eslint-disable @typescript-eslint/no-explicit-any */
// ---------------------------------------------------------------------------
// DEMO BACKEND
// A small in-browser imitation of the parts of supabase-js this app uses
// (query builder, rpc, auth, functions, storage). It mirrors the permission
// rules and workflow functions of supabase/schema.sql so every role can be
// tried without a server. Data is kept in localStorage of this browser only.
// ---------------------------------------------------------------------------
import { addDays, bdToday, uuid } from "../utils";
import { buildSeed } from "./seed";
import { DEFAULT_SETTINGS, REQUESTABLE_FIELDS, REQUESTABLE_KINDS, SELF_EDITABLE_FIELDS } from "../constants";

type Row = Record<string, any>;
type Store = Record<string, Row[]> & { auth_users: Row[]; photos: Row[] };
type Result = { data: any; error: any; count?: number | null };

const STORE_KEY = "ums-demo-store-v7";
const NUMERIC = ["height_in", "weight_lbs", "distance_from_ib_km"];
const normSnk = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();
const SESSION_KEY = "ums-demo-session-v1";

const UNIQUE_KEYS: Record<string, string[][]> = {
  companies: [["slug"]],
  soldiers: [["snk_no"]],
  profiles: [["soldier_id"]],
  leave_types: [["code"]],
  training_types: [["code"]],
  parade_states: [["date", "state_type"]],
  parade_entries: [["parade_state_id", "soldier_id"]],
  coy_submissions: [["parade_state_id", "company_id"]],
  training_records: [["soldier_id", "training_type_id", "year", "sequence_no", "attempt_no"]],
  duty_roster: [["date", "duty_type", "soldier_id"]],
  app_settings: [["key"]],
};
const PK: Record<string, string> = { app_settings: "key" };
const SOLDIER_CHILDREN = ["soldier_records", "profile_change_requests", "leave_applications", "training_records", "course_nominations", "itp_items", "duty_roster", "sick_reports", "cycle_plans"];
const AUDITED = ["soldiers", "soldier_records", "profiles", "leave_applications", "profile_change_requests", "training_records", "sick_reports"];

const DEFAULTS: Record<string, () => Row> = {
  soldiers: () => ({ status: "Serving", medical_category: "A", display_order: 0 }),
  profile_change_requests: () => ({ changes: {}, old_values: {}, record_ops: [], status: "Pending" }),
  leave_applications: () => ({ status: "Applied", applied_at: new Date().toISOString() }),
  parade_entries: () => ({ state: "Present", is_manual: false }),
  coy_submissions: () => ({ status: "Draft" }),
  training_records: () => ({ sequence_no: 1, attempt_no: 1 }),
  training_events: () => ({ event_type: "Training", status: "Planned" }),
  course_nominations: () => ({ course_type: "External", status: "Nominated" }),
  itp_items: () => ({ category: "Other", status: "Planned" }),
  daily_programmes: () => ({ status: "Planned" }),
  sick_reports: () => ({ disposal: "Duty", days: 1 }),
  notices: () => ({ category: "Notice", priority: "Normal", publish_date: bdToday(), attachments: [], issued_by: null }),
  officer_tasks: () => ({ category: "Admin", priority: "Normal", status: "Pending", assigned_to: [], details: null, remarks: null, deadline: null, completed_at: null }),
  soldier_records: () => ({ data: {} }),
  profiles: () => ({ role: "soldier", active: false, must_change_password: true }),
};

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const err = (message: string, code = "P0001") => ({ message, code, details: null, hint: null });
class DbError extends Error {
  code: string;
  constructor(message: string, code = "P0001") {
    super(message);
    this.code = code;
  }
}

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (typeof a === "number" || typeof b === "number") {
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  return String(a) < String(b) ? -1 : 1;
}
const same = (a: any, b: any) => (a === null || a === undefined ? b === null || b === undefined : String(a) === String(b));

// ------------------------------------------------------------- IndexedDB
const IDB_NAME = "ums-demo";
const IDB_KEY = STORE_KEY;
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
let idbConn: Promise<IDBDatabase> | null = null;
const conn = () => (idbConn ??= idbOpen());
async function idbGet(): Promise<unknown> {
  const d = await conn();
  return new Promise((resolve, reject) => {
    const r = d.transaction("kv").objectStore("kv").get(IDB_KEY);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(value: unknown): Promise<void> {
  const d = await conn();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
let warned = false;
function notifySaveFailed() {
  if (warned || typeof window === "undefined") return;
  warned = true;
  window.dispatchEvent(new CustomEvent("ums-demo-save-failed"));
}

// ===========================================================================
export class MockDb {
  store: Store;
  private listeners = new Set<(event: string, session: any) => void>();
  private systemDepth = 0;
  private saveTimer: any = null;

  /** Resolves when the demo data has been loaded (IndexedDB is asynchronous). */
  ready: Promise<void>;
  private useIdb = false;

  constructor() {
    this.store = {} as Store;
    this.ready = this.load();
    // Flush a pending save when the page is left or reloaded (e.g. right after a write).
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.saveTimer && this.persist(true));
  }

  // --------------------------------------------------------------- storage
  // The demo data (about 3 MB) lives in IndexedDB: localStorage is limited to about 5 MB per site
  // (Firefox counts it twice), which was too small and silently lost every change.
  private async load(): Promise<void> {
    if (typeof window === "undefined") { this.store = buildSeed() as Store; return; }
    let found: Store | null = null;
    try {
      found = (await idbGet()) as Store | null;
      this.useIdb = true;
    } catch {
      this.useIdb = false;
    }
    // demo data kept in localStorage by earlier versions: move it over once, then free the space
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!found && raw) found = JSON.parse(raw);
      for (const k of Object.keys(window.localStorage)) if (k.startsWith("ums-demo-store-") && (this.useIdb || k !== STORE_KEY)) window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    if (found && found.profiles) {
      this.store = found;
      if (this.useIdb) this.persist(true);
      return;
    }
    this.store = buildSeed() as Store;
    this.generateHistory();
    this.persist(true);
  }
  persist(now = false) {
    if (typeof window === "undefined") return;
    const write = () => {
      if (this.useIdb) {
        idbPut(this.store).catch((e) => {
          console.warn("Demo data could not be saved", e);
          notifySaveFailed();
        });
        return;
      }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(this.store));
      } catch (e) {
        console.warn("Demo data could not be saved", e);
        notifySaveFailed();
      }
    };
    if (now) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      return write();
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; write(); }, 60);
  }
  reset() {
    if (typeof window !== "undefined") try { window.localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    this.store = buildSeed() as Store;
    this.generateHistory();
    this.persist(true);
  }
  t(name: string): Row[] {
    return (this.store[name] ||= []);
  }

  // --------------------------------------------------------------- context
  sessionUserId(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(SESSION_KEY);
  }
  me(): Row | null {
    const id = this.sessionUserId();
    if (!id) return null;
    const p = this.t("profiles").find((r) => r.id === id);
    return p && p.active ? p : null;
  }
  role = () => this.me()?.role ?? null;
  company = () => this.me()?.company_id ?? null;
  mySoldier = () => this.me()?.soldier_id ?? null;
  isCommand = () => ["admin", "co", "2ic", "adjt"].includes(this.role() ?? "");
  isUnitWide = () => this.isCommand() || this.role() === "clk";
  private coyStaff = (cid: any) => ["coy_comd", "coy_rep"].includes(this.role() ?? "") && same(cid, this.company());
  isBnRep = () => this.role() === "bn_rep";
  /** CO / 2IC / Adjt / Admin, Coy Comd, or a login whose own record is an officer */
  isOfficer = () => this.isCommand() || this.role() === "coy_comd" || this.t("soldiers").find((x) => x.id === this.mySoldier())?.category === "Offr";
  canViewAll = () => this.isUnitWide() || this.isBnRep();
  isParadeMaster = () => this.isCommand() || this.isBnRep();
  canParade = (cid: any) => this.canOperate(cid) || this.isBnRep();
  canView = (cid: any) => this.canViewAll() || this.coyStaff(cid);
  /** personnel & training records */
  canEdit = (cid: any) => this.isUnitWide() || this.coyStaff(cid);
  /** parade state, duty roster, leave on behalf, rejoin */
  canOperate = (cid: any) => this.isCommand() || this.coyStaff(cid);
  /** approvals, coy programme / calendar / notices */
  canCommand = (cid: any) => this.isCommand() || (this.role() === "coy_comd" && same(cid, this.company()));
  canDecideLeave = (cid: any, sid: any) => {
    if (same(sid, this.mySoldier()) || same(sid, this.me()?.held_by_soldier)) return false;
    if (this.isCommand()) return true;
    const cat = this.t("soldiers").find((x) => x.id === sid)?.category ?? "OR";
    const bhq = this.t("companies").find((c) => same(c.id, cid))?.slug === "bhq";
    return this.role() === "coy_comd" && same(cid, this.company()) && cat !== "Offr" && !bhq;
  };
  get system() {
    return this.systemDepth > 0;
  }
  asSystem<T>(fn: () => T): T {
    this.systemDepth++;
    try {
      return fn();
    } finally {
      this.systemDepth--;
    }
  }

  // ------------------------------------------------------------------ RLS
  canRead(table: string, r: Row): boolean {
    if (this.system) return true;
    const role = this.role();
    if (!role) return false;
    const own = (sid: any) => sid && same(sid, this.mySoldier());
    switch (table) {
      case "soldiers":
        return this.canView(r.company_id) || own(r.id);
      case "soldier_records":
      case "profile_change_requests":
      case "leave_applications":
      case "training_records":
      case "course_nominations":
      case "itp_items":
      case "sick_reports":
      case "parade_entries":
        return this.canView(r.company_id) || own(r.soldier_id);
      case "parade_states":
      case "coy_submissions":
        return role !== "soldier";
      case "training_events":
      case "daily_programmes":
      case "notices":
        return !r.company_id || same(r.company_id, this.company()) || this.canViewAll();
      case "profiles":
        return r.id === this.sessionUserId() || this.isUnitWide() || this.coyStaff(r.company_id);
      case "training_photos":
        return this.isOfficer();
      case "audit_log":
        return this.isCommand();
      case "id_applications":
        return this.canCommand(r.company_id);
      case "cycle_plans":
        return this.canView(r.company_id) || own(r.soldier_id);
      case "officer_commitments":
        return this.isOfficer();
      case "officer_tasks":
        return this.isOfficer();
      case "appointment_holders":
        return this.isCommand() || r.profile_id === this.sessionUserId();
      case "id_application_secrets":
        return false;
      default:
        return true;
    }
  }
  canWrite(table: string, op: "insert" | "update" | "delete", r: Row): boolean {
    if (this.system) return true;
    const role = this.role();
    if (!role) return false;
    switch (table) {
      case "soldiers":
        return op === "delete" ? this.isCommand() : this.canEdit(r.company_id);
      case "soldier_records":
      case "training_records":
      case "course_nominations":
      case "itp_items":
      case "sick_reports":
        return this.canEdit(r.company_id);
      case "duty_roster":
        return this.canParade(r.company_id);
      case "cycle_plans":
        return this.canCommand(r.company_id);
      case "officer_commitments":
        return this.isCommand() || [this.mySoldier(), this.me()?.held_by_soldier].filter(Boolean).map(String).includes(String(r.soldier_id));
      case "officer_tasks":
        return op === "update" ? this.isCommand() || this.isMyTask(r) : this.isCommand();
      case "training_photos":
        return this.isCommand() || (!!r.company_id && this.role() === "coy_comd" && same(r.company_id, this.company()));
      case "leave_applications":
        if (op === "delete") return false;
        return r.status === "Applied" && (same(r.soldier_id, this.mySoldier()) || this.canOperate(r.company_id));
      case "profile_change_requests":
        return op === "insert" && r.status === "Pending" && (same(r.soldier_id, this.mySoldier()) || this.canEdit(r.company_id));
      case "parade_entries":
        return op === "update" && this.entryEditable(r.parade_state_id, r.company_id);
      case "training_events":
      case "daily_programmes":
      case "notices":
        // the Clerk enters daily commitments, the training calendar and notices on behalf of officers
        return this.isUnitWide() || (!!r.company_id && this.canCommand(r.company_id));
      case "companies":
      case "profiles":
      case "leave_types":
      case "training_types":
      case "app_settings":
        return this.isCommand();
      default:
        return false;
    }
  }
  entryEditable(stateId: string, companyId: string) {
    const st = this.t("parade_states").find((s) => s.id === stateId);
    if (!st || st.status !== "Open" || !this.canParade(companyId)) return false;
    if (this.isParadeMaster()) return true;
    const now = new Date().toISOString();
    if ((st.opens_at && now < st.opens_at) || (st.closes_at && now > st.closes_at)) return false;
    const sub = this.t("coy_submissions").find((s) => s.parade_state_id === stateId && same(s.company_id, companyId));
    return !sub || !["Submitted", "Accepted"].includes(sub.status);
  }

  // ------------------------------------------------------------- triggers
  /** an officer's own task (his individual login, or the soldier holding this appointment login) */
  isMyTask = (r: Row) => {
    const mine = [this.mySoldier(), this.me()?.held_by_soldier].filter(Boolean).map(String);
    return (r.assigned_to ?? []).some((x: string) => mine.includes(String(x)));
  };
  beforeWrite(table: string, row: Row, old: Row | null) {
    const now = new Date().toISOString();
    if (table === "officer_tasks") {
      if (old && !this.isCommand() && !this.system) {
        // the officer himself may only change status and remarks
        for (const k of ["title", "details", "category", "priority", "deadline", "assigned_to", "created_by"]) row[k] = old[k];
      }
      if (row.status === "Completed" && old?.status !== "Completed") row.completed_at = now;
      if (row.status !== "Completed") row.completed_at = null;
      if (!old) row.created_by ||= this.sessionUserId();
    }
    if (!old) {
      row.created_at ||= now;
    }
    if ("updated_at" in row || old) row.updated_at = now;
    if (SOLDIER_CHILDREN.includes(table) && row.soldier_id) {
      const s = this.t("soldiers").find((x) => x.id === row.soldier_id);
      if (!s) throw new DbError("Soldier record not found");
      row.company_id = s.company_id;
    }
    if (table === "leave_applications") {
      if (row.to_date < row.from_date) throw new DbError("To date cannot be before from date", "23514");
      row.days = Math.round((Date.parse(row.to_date) - Date.parse(row.from_date)) / 86400000) + 1;
      if (["Applied", "Recommended", "Approved"].includes(row.status)) {
        const clash = this.t("leave_applications").find(
          (l) =>
            l.soldier_id === row.soldier_id &&
            l.id !== row.id &&
            ["Applied", "Recommended", "Approved"].includes(l.status) &&
            l.from_date <= row.to_date &&
            (l.rejoin_date ? addDays(l.rejoin_date, -1) : l.to_date) >= row.from_date,
        );
        if (clash) throw new DbError(`This soldier already has leave applied/approved overlapping ${row.from_date} to ${row.to_date}`);
      }
    }
    if (table === "parade_entries") {
      if (row.state === "Absent") {
        row.employment = null;
        if (!row.absent_reason) row.absent_reason = "Other";
      } else {
        row.absent_reason = null;
        if (row.employment === "") row.employment = null;
      }
    }
  }
  afterWrite(table: string, op: string, row: Row, old: Row | null) {
    if (table === "profiles" && row.role !== "soldier" && (op === "INSERT" || row.held_by !== old?.held_by || row.held_by_soldier !== old?.held_by_soldier) && (row.held_by || row.held_by_soldier)) {
      const now = new Date().toISOString();
      for (const h of this.t("appointment_holders")) if (h.profile_id === row.id && !h.to_at) h.to_at = now;
      this.t("appointment_holders").push({ id: uuid(), profile_id: row.id, held_by: row.held_by ?? null, held_by_soldier: row.held_by_soldier ?? null, from_at: now, to_at: null, changed_by: this.sessionUserId() });
    }
    if (table === "soldiers" && old && old.company_id !== row.company_id) {
      this.asSystem(() => {
        for (const t of SOLDIER_CHILDREN) for (const r of this.t(t)) if (r.soldier_id === row.id) r.company_id = row.company_id;
        for (const p of this.t("profiles")) if (p.soldier_id === row.id && p.role === "soldier") p.company_id = row.company_id;
        const open = new Set(this.t("parade_states").filter((s) => s.status === "Open").map((s) => s.id));
        for (const e of this.t("parade_entries")) if (e.soldier_id === row.id && open.has(e.parade_state_id)) e.company_id = row.company_id;
      });
    }
    if (AUDITED.includes(table) && this.systemDepth === 0) {
      let changes: Row = row;
      if (op === "UPDATE" && old) {
        changes = {};
        for (const k of Object.keys(row)) if (k !== "updated_at" && JSON.stringify(row[k]) !== JSON.stringify(old[k])) changes[k] = { from: old[k] ?? null, to: row[k] ?? null };
        if (!Object.keys(changes).length) return;
      }
      this.t("audit_log").push({ id: this.t("audit_log").length + 1, at: new Date().toISOString(), actor: this.sessionUserId(), table_name: table, record_id: row.id, action: op, changes });
    }
  }
  checkUnique(table: string, row: Row) {
    if (table === "soldiers" && row.snk_no) {
      const n = normSnk(row.snk_no);
      if (this.t("soldiers").some((r) => r !== row && r.id !== row.id && normSnk(r.snk_no) === n)) throw new DbError(`Personal No ${row.snk_no} already exists (duplicate key value violates unique constraint "soldiers_snk_norm_uidx")`, "23505");
    }
    for (const keys of UNIQUE_KEYS[table] ?? []) {
      if (keys.some((k) => row[k] === null || row[k] === undefined)) continue;
      const dup = this.t(table).find((r) => r !== row && (r.id ?? r.key) !== (row.id ?? row.key) && keys.every((k) => same(r[k], row[k])));
      if (dup) throw new DbError(`duplicate key value violates unique constraint (${keys.join(", ")})`, "23505");
    }
  }
  cascadeDelete(table: string, row: Row) {
    if (table === "soldiers") {
      for (const t of [...SOLDIER_CHILDREN, "parade_entries"]) this.store[t] = this.t(t).filter((r) => r.soldier_id !== row.id);
      for (const p of this.t("profiles")) if (p.soldier_id === row.id) p.soldier_id = null;
    }
    if (table === "parade_states") {
      this.store.parade_entries = this.t("parade_entries").filter((r) => r.parade_state_id !== row.id);
      this.store.coy_submissions = this.t("coy_submissions").filter((r) => r.parade_state_id !== row.id);
    }
  }

  // ---------------------------------------------------------- public API
  from(table: string) {
    return new MockQuery(this, table);
  }

  async rpc(name: string, args: Row = {}): Promise<Result> {
    await this.ready;
    try {
      const data = this.runRpc(name, args);
      this.persist();
      return { data: clone(data), error: null };
    } catch (e: any) {
      return { data: null, error: err(e.message ?? String(e), e.code) };
    }
  }

  auth = {
    getSession: async () => {
      await this.ready;
      const u = this.currentAuthUser();
      return { data: { session: u ? { user: { id: u.id, email: u.email }, access_token: "demo" } : null }, error: null };
    },
    getUser: async () => {
      await this.ready;
      const u = this.currentAuthUser();
      return { data: { user: u ? { id: u.id, email: u.email } : null }, error: null };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      await this.ready;
      const u = this.store.auth_users.find((x) => x.email === String(email).toLowerCase());
      const p = u && this.t("profiles").find((x) => x.id === u.id);
      if (!u || (u.password && u.password !== password)) return { data: { session: null, user: null }, error: err("Invalid login credentials") };
      if (!p?.active) return { data: { session: null, user: null }, error: err("This account is not active") };
      window.localStorage.setItem(SESSION_KEY, u.id);
      const session = { user: { id: u.id, email: u.email }, access_token: "demo" };
      this.listeners.forEach((l) => l("SIGNED_IN", session));
      return { data: { session, user: session.user }, error: null };
    },
    signOut: async () => {
      window.localStorage.removeItem(SESSION_KEY);
      this.listeners.forEach((l) => l("SIGNED_OUT", null));
      return { error: null };
    },
    updateUser: async ({ password }: { password?: string }) => {
      await this.ready;
      const u = this.currentAuthUser();
      if (!u) return { data: null, error: err("Not signed in") };
      if (password) u.password = password;
      this.persist();
      return { data: { user: { id: u.id } }, error: null };
    },
    onAuthStateChange: (cb: (event: string, session: any) => void) => {
      this.listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => this.listeners.delete(cb) } } };
    },
  };

  functions = {
    invoke: async (name: string, opts: { body?: Row } = {}) => {
      await this.ready;
      if (name !== "manage-users") return { data: null, error: err("Unknown function") };
      try {
        const data = this.manageUsers(opts.body ?? {});
        this.persist();
        return { data, error: null };
      } catch (e: any) {
        return { data: null, error: err(e.message) };
      }
    },
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: Blob) => {
        await this.ready;
        if (file.size > 5_000_000) return { data: null, error: err("Demo mode: please use a smaller photo") };
        const dataUrl = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(file);
        });
        this.store.photos = this.store.photos.filter((p) => p.path !== `${bucket}/${path}`);
        this.store.photos.push({ path: `${bucket}/${path}`, url: dataUrl });
        this.persist();
        return { data: { path }, error: null };
      },
      createSignedUrl: async (path: string) => {
        await this.ready;
        const p = this.store.photos.find((x) => x.path === `${bucket}/${path}`);
        return p ? { data: { signedUrl: p.url }, error: null } : { data: null, error: err("Not found") };
      },
      remove: async (paths: string[]) => {
        this.store.photos = this.store.photos.filter((p) => !paths.map((x) => `${bucket}/${x}`).includes(p.path));
        this.persist();
        return { data: null, error: null };
      },
    }),
  };

  channel() {
    const ch: any = { on: () => ch, subscribe: () => ch, unsubscribe: () => undefined };
    return ch;
  }
  removeChannel() {
    return Promise.resolve();
  }

  private currentAuthUser() {
    const id = this.sessionUserId();
    return id ? this.store.auth_users.find((u) => u.id === id) ?? null : null;
  }

  // ================================================================ RPCs
  private runRpc(name: string, a: Row): any {
    switch (name) {
      case "bd_today":
        return bdToday();
      case "soldier_directory":
        if (!this.role()) return [];
        return this.t("soldiers").map((s) => ({ id: s.id, snk_no: s.snk_no, rank: s.rank, category: s.category, trade: s.trade, name: s.name, name_bn: s.name_bn ?? null, company_id: s.company_id, status: s.status, display_order: s.display_order, appointment: s.appointment ?? null }));
      case "ensure_parade_states":
        return this.ensureParadeStates(a.p_date);
      case "ensure_parade_state":
        return this.ensureParadeStates(a.p_date)[0] ?? null;
      case "open_extra_state":
        return this.openExtraState(a.p_date, a.p_name, a.p_closes_at ?? null, a.p_copy_from ?? null);
      case "copy_parade_state":
        return this.copyState(a.p_from, a.p_to, a.p_company ?? null);
      case "auto_close_parade_states":
        return this.autoClose();
      case "sync_parade_state":
        this.requireStaff();
        return this.asSystem(() => this.syncParadeState(a.p_state_id));
      case "start_second_state":
        this.ensureParadeStates(a.p_date);
        return this.t("parade_states").find((x) => x.date === a.p_date && x.kind === "Second")?.id ?? null;
      case "set_submission_status":
        return this.setSubmission(a.p_state_id, a.p_company, a.p_status, a.p_remarks ?? null);
      case "finalize_parade_state":
        return this.finalize(a.p_state_id, !!a.p_force);
      case "reopen_parade_state": {
        if (!this.isCommand()) throw new DbError("Only Adjt / 2IC / CO can reopen a state");
        const st = this.t("parade_states").find((s) => s.id === a.p_state_id);
        if (st) {
          const later = new Date(Date.now() + 2 * 3600_000).toISOString();
          Object.assign(st, { status: "Open", finalized_by: null, finalized_at: null, closes_at: st.closes_at && st.closes_at > later ? st.closes_at : later });
        }
        return null;
      }
      case "leave_action":
        return this.leaveAction(a.p_id, a.p_action, a.p_remarks ?? null, a.p_date ?? null);
      case "review_profile_request":
        return this.reviewProfileRequest(a.p_id, !!a.p_approve, a.p_remarks ?? null);
      case "cancel_profile_request": {
        const r = this.t("profile_change_requests").find((x) => x.id === a.p_id && x.status === "Pending");
        if (!r || !(same(r.soldier_id, this.mySoldier()) || this.canEdit(r.company_id))) throw new DbError("Request not found or not pending");
        r.status = "Cancelled";
        return null;
      }
      case "registration_options":
        return this.asSystem(() => ({
          companies: this.t("companies").filter((c) => c.active).sort((a, b) => a.display_order - b.display_order).map((c) => ({ id: c.id, name: c.name, short_name: c.short_name })),
          ranks: this.t("app_settings").find((x) => x.key === "ranks")?.value,
          trades: this.t("app_settings").find((x) => x.key === "trades")?.value,
          unit: this.t("app_settings").find((x) => x.key === "unit")?.value,
        }));
      case "submit_id_application":
        return this.submitApplication(a.p ?? {}, String(a.p_password ?? ""));
      case "id_application_status": {
        const n = normSnk(a.p_snk ?? "");
        const r = this.t("id_applications").filter((x) => normSnk(x.snk_no) === n).sort((x, y) => String(y.submitted_at).localeCompare(String(x.submitted_at)))[0];
        return r ? [{ status: r.status, submitted_at: r.submitted_at, review_remarks: r.review_remarks ?? null }] : [];
      }
      case "reject_id_application": {
        if (!this.isCommand()) throw new DbError("Only the Adjt (or 2IC / CO) can decide ID applications");
        const r = this.t("id_applications").find((x) => x.id === a.p_id && x.status === "Pending");
        if (!r) throw new DbError("Application not found or already decided");
        Object.assign(r, { status: "Rejected", reviewed_by: this.sessionUserId(), reviewed_at: new Date().toISOString(), review_remarks: a.p_remarks ?? null });
        this.store.id_application_secrets = this.t("id_application_secrets").filter((x) => x.application_id !== r.id);
        return null;
      }
      case "complete_my_profile": {
        const sid = this.mySoldier();
        if (!sid) throw new DbError("Your login is not linked to a soldier record");
        const s = this.t("soldiers").find((x) => x.id === sid);
        let n = 0;
        if (s) {
          for (const [k, v] of Object.entries(a.p_fields ?? {})) {
            if (!(SELF_EDITABLE_FIELDS as readonly string[]).includes(k) || v === null || v === undefined || String(v).trim() === "") continue;
            if (s[k] === null || s[k] === undefined || String(s[k]) === "") { s[k] = NUMERIC.includes(k) ? Number(v) : v; n++; }
          }
          s.updated_at = new Date().toISOString();
          for (const r of a.p_records ?? []) {
            if (!["family", "education"].includes(r.kind)) continue;
            this.t("soldier_records").push({ id: uuid(), soldier_id: sid, company_id: s.company_id, kind: r.kind, record_date: r.record_date || null, data: r.data ?? {}, created_at: new Date().toISOString() });
            n++;
          }
          this.afterWrite("soldiers", "UPDATE", s, null);
        }
        return n;
      }
      case "mark_password_changed": {
        const p = this.me();
        if (p) p.must_change_password = false;
        return null;
      }
      default:
        throw new DbError(`Unknown function ${name}`);
    }
  }
  private requireStaff() {
    const r = this.role();
    if (!r || r === "soldier") throw new DbError("Not permitted");
  }

  // ----------------------------------------------------- parade engine
  autoValues(soldier: Row, date: string): Row {
    if (soldier.atts_type && (!soldier.atts_from || soldier.atts_from <= date) && (!soldier.atts_to || soldier.atts_to >= date))
      return { state: "Absent", absent_reason: soldier.atts_type, employment: null, location: soldier.atts_location ?? null, auto_note: "Attachment on soldier record" };

    const leave = this.t("leave_applications")
      .filter((l) => l.soldier_id === soldier.id && l.status === "Approved" && l.from_date <= date && (l.rejoin_date ? l.rejoin_date > date : l.to_date >= addDays(date, -30)))
      .sort((x, y) => cmp(y.from_date, x.from_date))[0];
    if (leave) {
      const lt = this.t("leave_types").find((t) => t.id === leave.leave_type_id);
      const due = leave.to_date;
      const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });
      return {
        state: "Absent",
        absent_reason: "Leave",
        employment: null,
        location: null,
        auto_note: due < date ? `${lt?.name ?? "Leave"} — due back ${fmt(due)}, rejoin not reported` : `${lt?.name ?? "Leave"} till ${fmt(due)}`,
      };
    }
    const courseOn = (type: string) =>
      this.t("course_nominations")
        .filter((c) => c.soldier_id === soldier.id && c.course_type === type && ["Nominated", "Attending"].includes(c.status) && c.from_date && c.from_date <= date && (c.to_date ?? c.from_date) >= date)
        .sort((x, y) => cmp(y.from_date, x.from_date))[0];
    const ext = courseOn("External");
    if (ext) return { state: "Absent", absent_reason: "Course", employment: null, location: ext.institution ?? null, auto_note: ext.course_name };

    const adm = this.t("sick_reports")
      .filter((r) => r.soldier_id === soldier.id && r.disposal === "Admitted" && r.report_date <= date && (!r.discharge_date || r.discharge_date > date))
      .sort((x, y) => cmp(y.report_date, x.report_date))[0];
    if (adm) return { state: "Absent", absent_reason: "Hospital", employment: null, location: adm.hospital || "Hospital", auto_note: adm.complaint ? `Admitted: ${adm.complaint}` : "Admitted" };

    const ed = this.t("sick_reports")
      .filter((r) => r.soldier_id === soldier.id && ["Excused Duty", "Light Duty"].includes(r.disposal) && r.report_date <= date && addDays(r.report_date, Math.max(r.days ?? 1, 1) - 1) >= date)
      .sort((x, y) => cmp(y.report_date, x.report_date))[0];
    if (ed) return { state: "Present", absent_reason: null, employment: ed.disposal, location: null, auto_note: "From sick report" };

    const internal = courseOn("Internal");
    if (internal) return { state: "Present", absent_reason: null, employment: "Cadre/Course", location: null, auto_note: internal.course_name };

    const duty = this.t("duty_roster")
      .filter((d) => d.soldier_id === soldier.id && d.date === date)
      .sort((x, y) => cmp(x.created_at, y.created_at))[0];
    if (duty) return { state: "Present", absent_reason: null, employment: duty.duty_type, location: null, auto_note: "From duty roster" };

    return { state: "Present", absent_reason: null, employment: null, location: null, auto_note: null };
  }

  syncParadeState(stateId: string) {
    const st = this.t("parade_states").find((s) => s.id === stateId);
    if (!st || st.status !== "Open") return null;
    for (const c of this.t("companies").filter((c) => c.active))
      if (!this.t("coy_submissions").some((s) => s.parade_state_id === stateId && s.company_id === c.id))
        this.t("coy_submissions").push({ id: uuid(), parade_state_id: stateId, company_id: c.id, status: "Draft", submitted_by: null, submitted_at: null, reviewed_by: null, reviewed_at: null, remarks: null });

    const soldiers = new Map(this.t("soldiers").map((s) => [s.id, s]));
    this.store.parade_entries = this.t("parade_entries").filter((e) => e.parade_state_id !== stateId || soldiers.get(e.soldier_id)?.status === "Serving");
    const locked = new Set(this.t("coy_submissions").filter((s) => s.parade_state_id === stateId && ["Submitted", "Accepted"].includes(s.status)).map((s) => s.company_id));
    const existing = new Map(this.t("parade_entries").filter((e) => e.parade_state_id === stateId).map((e) => [e.soldier_id, e]));
    const now = new Date().toISOString();
    for (const s of soldiers.values()) {
      if (s.status !== "Serving") continue;
      const e = existing.get(s.id);
      const v = this.autoValues(s, st.date);
      if (!e) {
        this.t("parade_entries").push({ id: uuid(), parade_state_id: stateId, soldier_id: s.id, company_id: s.company_id, remarks: null, is_manual: false, updated_by: null, updated_at: now, ...v });
      } else if (!e.is_manual && !locked.has(e.company_id)) {
        Object.assign(e, v, { company_id: s.company_id });
      }
    }
    return null;
  }

  // ---- parade states: Morning State + 2nd Parade State every day, extra states on requirement
  paradeWindow(date: string, kind: string) {
    const w = { ...DEFAULT_SETTINGS.parade_windows, ...(this.t("app_settings").find((x) => x.key === "parade_windows")?.value ?? {}) };
    const at = (d: string, hm: string) => new Date(`${d}T${hm.length === 5 ? hm : "00:00"}:00+06:00`).toISOString();
    const close = kind === "Second" ? w.second_close : kind === "Extra" ? w.extra_close : w.morning_close;
    return { opens_at: at(addDays(date, -1), w.open_time), closes_at: at(date, close) };
  }
  autoClose() {
    const now = new Date().toISOString();
    let n = 0;
    for (const st of this.t("parade_states")) {
      if (st.status === "Open" && st.closes_at && st.closes_at <= now) {
        for (const sub of this.t("coy_submissions").filter((x) => x.parade_state_id === st.id)) if (sub.status !== "Accepted") Object.assign(sub, { status: "Accepted", reviewed_at: sub.reviewed_at ?? now });
        Object.assign(st, { status: "Finalized", finalized_at: st.closes_at });
        n++;
      }
    }
    return n;
  }
  private ensureParadeStates(date: string) {
    this.requireStaff();
    this.autoClose();
    if (date > addDays(bdToday(), 1)) throw new DbError("A parade state can be opened at most one day in advance");
    const now = new Date();
    for (const kind of ["Morning", "Second"]) {
      if (this.t("parade_states").some((x) => x.date === date && x.kind === kind)) continue;
      const w = this.paradeWindow(date, kind);
      if (now.toISOString() < w.opens_at && !this.isParadeMaster()) continue;
      if (w.closes_at <= now.toISOString() && !this.isCommand()) continue;
      const later = new Date(now.getTime() + 2 * 3600_000).toISOString();
      this.t("parade_states").push({
        id: uuid(), date, state_type: kind === "Morning" ? "Morning State" : "2nd Parade State", kind, status: "Open",
        opens_at: w.opens_at < now.toISOString() ? w.opens_at : now.toISOString(), closes_at: w.closes_at > later ? w.closes_at : later,
        display_order: kind === "Morning" ? 1 : 2, created_by: this.sessionUserId(), finalized_by: null, finalized_at: null, created_at: now.toISOString(),
      });
    }
    const states = this.t("parade_states").filter((x) => x.date === date).sort((a, b) => a.display_order - b.display_order || String(a.created_at).localeCompare(String(b.created_at)));
    for (const st of states) if (st.status === "Open") this.asSystem(() => this.syncParadeState(st.id));
    return states.map((x) => x.id);
  }
  private openExtraState(date: string, name: string, closesAt: string | null, copyFrom: string | null) {
    if (!this.isParadeMaster()) throw new DbError("Only Adjt / 2IC / CO or the Bn Rep can open another state");
    const nm = String(name ?? "").trim();
    if (!nm) throw new DbError("Give the state a name, e.g. Durbar");
    if (this.t("parade_states").some((x) => x.date === date && String(x.state_type).toLowerCase() === nm.toLowerCase())) throw new DbError(`A state named "${nm}" already exists for this date`);
    const now = new Date();
    const min = new Date(now.getTime() + 30 * 60_000).toISOString();
    const close = closesAt ?? this.paradeWindow(date, "Extra").closes_at;
    const st = {
      id: uuid(), date, state_type: nm.slice(0, 40), kind: "Extra", status: "Open", opens_at: now.toISOString(), closes_at: close > min ? close : min,
      display_order: 10 + this.t("parade_states").filter((x) => x.date === date).length, created_by: this.sessionUserId(), finalized_by: null, finalized_at: null, created_at: now.toISOString(),
    };
    this.t("parade_states").push(st);
    this.asSystem(() => this.syncParadeState(st.id));
    if (copyFrom) this.copyState(copyFrom, st.id, null);
    return st.id;
  }
  private copyState(from: string, to: string, company: string | null) {
    const target = this.t("parade_states").find((x) => x.id === to && x.status === "Open");
    if (!target) throw new DbError("The target state is not open");
    let n = 0;
    const src = new Map(this.t("parade_entries").filter((e) => e.parade_state_id === from).map((e) => [e.soldier_id, e]));
    for (const c of this.t("companies").filter((x) => x.active && (!company || x.id === company))) {
      if (!this.entryEditable(to, c.id)) continue;
      for (const e of this.t("parade_entries").filter((x) => x.parade_state_id === to && x.company_id === c.id)) {
        const f = src.get(e.soldier_id);
        if (!f) continue;
        Object.assign(e, { state: f.state, absent_reason: f.absent_reason, employment: f.employment, location: f.location, remarks: f.remarks, is_manual: f.is_manual, auto_note: f.auto_note, updated_by: this.sessionUserId() });
        n++;
      }
    }
    return n;
  }

  private setSubmission(stateId: string, companyId: string, status: string, remarks: string | null) {
    const st = this.t("parade_states").find((s) => s.id === stateId);
    if (!st || st.status !== "Open") throw new DbError("This parade state is finalized");
    const sub = this.t("coy_submissions").find((s) => s.parade_state_id === stateId && s.company_id === companyId);
    if (!sub) throw new DbError("Company submission not found");
    const now = new Date().toISOString();
    if (status === "Submitted") {
      if (!this.canParade(companyId)) throw new DbError("Not permitted");
      Object.assign(sub, { status, submitted_by: this.sessionUserId(), submitted_at: now, remarks: remarks ?? sub.remarks });
    } else if (status === "Draft") {
      if (!this.canParade(companyId)) throw new DbError("Not permitted");
      if (sub.status === "Accepted" && !this.isParadeMaster()) throw new DbError("Already accepted by Adjt / Bn Rep");
      sub.status = "Draft";
    } else if (status === "Accepted" || status === "Returned") {
      if (!this.isParadeMaster()) throw new DbError("Only Adjt / 2IC / CO or the Bn Rep can accept or return a state");
      Object.assign(sub, { status, reviewed_by: this.sessionUserId(), reviewed_at: now, remarks: remarks ?? sub.remarks });
    } else throw new DbError(`Unknown status ${status}`);
    return null;
  }

  private finalize(stateId: string, force: boolean) {
    if (!this.isCommand()) throw new DbError("Only Admin, CO, 2IC or Adjt can finalize");
    const activeCoys = new Set(this.t("companies").filter((c) => c.active).map((c) => c.id));
    const subs = this.t("coy_submissions").filter((s) => s.parade_state_id === stateId);
    const pending = subs.filter((s) => activeCoys.has(s.company_id) && !["Submitted", "Accepted"].includes(s.status)).length;
    if (pending > 0 && !force) throw new DbError(`Cannot finalize: ${pending} company state(s) not yet submitted`);
    const now = new Date().toISOString();
    for (const s of subs) Object.assign(s, { status: "Accepted", reviewed_by: s.reviewed_by ?? this.sessionUserId(), reviewed_at: s.reviewed_at ?? now });
    const st = this.t("parade_states").find((s) => s.id === stateId);
    if (st) Object.assign(st, { status: "Finalized", finalized_by: this.sessionUserId(), finalized_at: now });
    return null;
  }

  // ------------------------------------------------------------- leave
  private leaveAction(id: string, action: string, remarks: string | null, date: string | null) {
    const l = this.t("leave_applications").find((x) => x.id === id);
    if (!l) throw new DbError("Leave application not found");
    const now = new Date().toISOString();
    const uid = this.sessionUserId();
    if (action === "approve" || action === "reject" || action === "recommend") {
      if (!["Applied", "Recommended"].includes(l.status)) throw new DbError(`This leave is already ${l.status.toLowerCase()}`);
      if (!this.canDecideLeave(l.company_id, l.soldier_id)) throw new DbError("Only the Coy Comd (or Adjt / 2IC / CO) can approve this leave");
      Object.assign(l, { status: action === "reject" ? "Rejected" : "Approved", decided_by: uid, decided_at: now, decision_remarks: remarks });
    } else if (action === "cancel") {
      if (["Rejected", "Cancelled"].includes(l.status)) throw new DbError(`This leave is already ${l.status.toLowerCase()}`);
      if (l.status === "Approved" && !this.canDecideLeave(l.company_id, l.soldier_id)) throw new DbError("Approved leave can only be cancelled by the Coy Comd or Adjt");
      if (!(same(l.soldier_id, this.mySoldier()) || this.canOperate(l.company_id))) throw new DbError("Not permitted");
      Object.assign(l, { status: "Cancelled", decision_remarks: remarks ?? l.decision_remarks, decided_by: uid, decided_at: now });
    } else if (action === "rejoin") {
      if (l.status !== "Approved") throw new DbError("Only approved leave can be marked rejoined");
      if (!this.canOperate(l.company_id)) throw new DbError("Not permitted");
      const d = date ?? bdToday();
      if (d < l.from_date) throw new DbError("Rejoin date cannot be before leave start");
      Object.assign(l, { rejoin_date: d, rejoin_by: uid });
    } else throw new DbError(`Unknown leave action ${action}`);
    l.updated_at = now;
    this.afterWrite("leave_applications", "UPDATE", l, null);
    return null;
  }

  // ------------------------------------------------- new ID applications
  private submitApplication(p: Row, password: string) {
    const snk = String(p.snk_no ?? "").trim();
    if (!snk) throw new DbError("Personal No is required");
    if (snk.length > 20) throw new DbError("Personal No is too long");
    if (!p.name || !p.rank) throw new DbError("Rank and name are required");
    if (!["Offr", "JCO", "OR"].includes(p.category)) throw new DbError("Category is required");
    if (!this.t("companies").some((c) => c.id === p.company_id && c.active)) throw new DbError("Choose your company");
    if (password.length < 8) throw new DbError("Password must be at least 8 characters");
    const n = normSnk(snk);
    if (this.t("soldiers").some((s) => normSnk(s.snk_no) === n)) throw new DbError(`Personal No ${snk} is already registered in the unit. If you have no login, ask your Coy Comd or the Orderly Room.`);
    if (this.t("id_applications").some((x) => x.status === "Pending" && normSnk(x.snk_no) === n)) throw new DbError(`An application for Personal No ${snk} is already waiting for approval`);
    const data: Row = {};
    for (const k of SELF_EDITABLE_FIELDS) if (!["category", "rank", "name"].includes(k) && p[k] !== undefined && p[k] !== null && String(p[k]) !== "") data[k] = String(p[k]).slice(0, 500);
    const id = uuid();
    this.t("id_applications").push({
      id, snk_no: snk, category: p.category, rank: String(p.rank).slice(0, 30), name: String(p.name).slice(0, 120), company_id: p.company_id, data,
      records: (p.records ?? []).filter((r: Row) => ["family", "education"].includes(r?.kind)), status: "Pending", submitted_at: new Date().toISOString(),
      reviewed_by: null, reviewed_at: null, review_remarks: null, soldier_id: null, user_id: null,
    });
    this.t("id_application_secrets").push({ application_id: id, password });
    return id;
  }
  private approveApplication(body: Row) {
    const app = this.t("id_applications").find((x) => x.id === body.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status !== "Pending") throw new Error(`Application is already ${String(app.status).toLowerCase()}`);
    const secret = this.t("id_application_secrets").find((x) => x.application_id === app.id);
    if (!secret) throw new Error("Password of this application is missing — ask him to apply again.");
    const companyId = body.companyId ?? app.company_id;
    if (this.t("soldiers").some((s) => normSnk(s.snk_no) === normSnk(app.snk_no))) throw new Error(`Personal No ${app.snk_no} is already in the soldiers database.`);
    const now = new Date().toISOString();
    const soldier: Row = {
      ...Object.fromEntries(Object.keys(this.t("soldiers")[0] ?? {}).map((k) => [k, null])),
      ...app.data, id: uuid(), snk_no: app.snk_no, category: app.category, rank: app.rank, name: app.name, company_id: companyId, status: "Serving",
      display_order: 0, photo_path: null, created_at: now, updated_at: now,
    };
    for (const k of ["height_in", "weight_lbs", "distance_from_ib_km"]) if (soldier[k] !== null && soldier[k] !== undefined) soldier[k] = Number(soldier[k]);
    if (!soldier.medical_category) soldier.medical_category = "A";
    this.t("soldiers").push(soldier);
    for (const r of app.records ?? []) this.t("soldier_records").push({ id: uuid(), soldier_id: soldier.id, company_id: companyId, kind: r.kind, record_date: r.record_date || null, data: r.data ?? {}, created_at: now });
    const domain = (process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "5sigbn.local").toLowerCase();
    const email = `${String(app.snk_no).trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "-")}@${domain}`;
    if (this.store.auth_users.some((u) => u.email === email)) {
      this.store.soldiers = this.t("soldiers").filter((x) => x.id !== soldier.id);
      throw new Error("A login with this Personal No already exists");
    }
    const userId = uuid();
    this.store.auth_users.push({ id: userId, email, password: secret.password });
    this.t("profiles").push({ id: userId, full_name: `${app.rank} ${app.name}`, role: "soldier", company_id: companyId, soldier_id: soldier.id, active: true, must_change_password: false, created_at: now });
    Object.assign(app, { status: "Approved", company_id: companyId, reviewed_by: this.sessionUserId(), reviewed_at: now, review_remarks: body.remarks ?? null, soldier_id: soldier.id, user_id: userId });
    this.store.id_application_secrets = this.t("id_application_secrets").filter((x) => x.application_id !== app.id);
    return { ok: true, soldierId: soldier.id, userId, loginId: app.snk_no };
  }

  // -------------------------------------------- profile change requests
  private reviewProfileRequest(id: string, approve: boolean, remarks: string | null) {
    const r = this.t("profile_change_requests").find((x) => x.id === id);
    if (!r) throw new DbError("Request not found");
    if (r.status !== "Pending") throw new DbError(`Request is already ${r.status.toLowerCase()}`);
    if (!this.canCommand(r.company_id)) throw new DbError("Only the Coy Comd (or Adjt / 2IC / CO) can approve profile updates");
    if (approve) {
      const allowed: readonly string[] = REQUESTABLE_FIELDS;
      const s = this.t("soldiers").find((x) => x.id === r.soldier_id);
      if (s) {
        for (const [k, v] of Object.entries(r.changes ?? {})) if (allowed.includes(k)) s[k] = v === "" || v === null ? null : NUMERIC.includes(k) ? Number(v) : v;
        s.updated_at = new Date().toISOString();
      }
      for (const op of r.record_ops ?? []) {
        if (!REQUESTABLE_KINDS.includes(op.kind)) continue;
        if (op.op === "add") this.t("soldier_records").push({ id: uuid(), soldier_id: r.soldier_id, company_id: r.company_id, kind: op.kind, record_date: op.record_date || null, data: op.data ?? {}, created_at: new Date().toISOString() });
        if (op.op === "update") {
          const rec = this.t("soldier_records").find((x) => x.id === op.id && x.soldier_id === r.soldier_id && x.kind === op.kind);
          if (rec) Object.assign(rec, { data: op.data ?? rec.data, record_date: op.record_date || rec.record_date });
        }
        if (op.op === "delete") this.store.soldier_records = this.t("soldier_records").filter((x) => !(x.id === op.id && x.soldier_id === r.soldier_id && x.kind === op.kind));
      }
    }
    Object.assign(r, { status: approve ? "Approved" : "Rejected", reviewed_by: this.sessionUserId(), reviewed_at: new Date().toISOString(), review_remarks: remarks });
    return null;
  }

  // -------------------------------------------------- manage-users
  private manageUsers(body: Row) {
    const me = this.me();
    if (!me) throw new Error("Your account is not active.");
    const isAdmin = ["admin", "co", "2ic", "adjt"].includes(me.role);
    const coyClk = me.role === "coy_comd" && !!me.company_id; // coy comd manages own coy soldiers
    if (!isAdmin && !coyClk) throw new Error("You are not permitted to manage accounts.");
    const canSoldier = (cid: any) => isAdmin || (coyClk && cid === me.company_id);
    const domain = (process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "5sigbn.local").toLowerCase();
    const emailOf = (id: string) => `${id.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "-")}@${domain}`;

    if (body.action === "approve_application") {
      if (!isAdmin) throw new Error("Only the Adjt (or 2IC / CO / Admin) can approve ID applications.");
      return this.asSystem(() => this.approveApplication(body));
    }
    if (body.action === "list") {
      return {
        users: this.t("profiles")
          .filter((p) => !coyClk || p.company_id === me.company_id)
          .map((p) => {
            const u = this.store.auth_users.find((x) => x.id === p.id);
            return { id: p.id, fullName: p.full_name, role: p.role, companyId: p.company_id, soldierId: p.soldier_id, active: p.active, mustChangePassword: p.must_change_password, loginId: (u?.email ?? "").split("@")[0], email: u?.email ?? "", lastSignIn: null, appointment: p.appointment ?? null, heldBy: p.held_by ?? null, heldBySoldier: p.held_by_soldier ?? null };
          }),
      };
    }
    if (body.action === "create" || body.action === "bulk_create") {
      const items: Row[] = body.action === "create" ? [body] : (body.soldierIds ?? []).map((id: string) => ({ soldierId: id, role: "soldier" }));
      if (String(body.password ?? "").length < 8) throw new Error("Initial password must be at least 8 characters.");
      const results: Row[] = [];
      for (const item of items) {
        try {
          const role = item.role ?? "soldier";
          if (role !== "soldier" && !isAdmin) throw new Error("Only Adjt / 2IC / CO / Admin can create staff accounts");
          let { loginId = "", fullName = "", companyId = null } = item;
          const soldierId = role === "soldier" ? item.soldierId ?? null : null;
          const appointment = role === "soldier" ? null : String(item.appointment ?? item.fullName ?? "").trim() || null;
          const heldBy = role === "soldier" ? null : String(item.heldBy ?? "").trim() || null;
          const heldBySoldier = role === "soldier" ? null : item.heldBySoldier ?? null;
          if (role !== "soldier") fullName = fullName || appointment || "";
          if (soldierId) {
            const s = this.t("soldiers").find((x) => x.id === soldierId);
            if (!s) throw new Error("Soldier not found");
            if (this.t("profiles").some((p) => p.soldier_id === soldierId)) throw new Error("Already has an account");
            loginId ||= s.snk_no;
            fullName ||= `${s.rank} ${s.name}`;
            if (role === "soldier" || ["coy_comd", "coy_rep"].includes(role)) companyId = companyId ?? s.company_id;
            if (role === "soldier") companyId = s.company_id;
          }
          if (!loginId) throw new Error("Personal No / login ID is required");
          if (["coy_comd", "coy_rep"].includes(role) && !companyId) throw new Error("Coy Comd / Coy Rep must have a company");
          if (["admin", "co", "2ic", "adjt", "bn_rep", "clk"].includes(role)) companyId = null;
          if (role === "soldier" && !canSoldier(companyId)) throw new Error("Outside your company");
          const email = emailOf(loginId);
          if (this.store.auth_users.some((u) => u.email === email)) throw new Error("A user with this login already exists");
          const id = uuid();
          this.store.auth_users.push({ id, email, password: body.password });
          const prof = { id, full_name: fullName, role, company_id: companyId, soldier_id: soldierId, appointment, held_by: heldBy, held_by_soldier: heldBySoldier, active: true, must_change_password: true, created_at: new Date().toISOString() };
          this.t("profiles").push(prof);
          this.afterWrite("profiles", "INSERT", prof, null);
          results.push({ soldierId, loginId, ok: true, id });
        } catch (e: any) {
          results.push({ soldierId: item.soldierId, loginId: item.loginId, ok: false, error: e.message });
        }
      }
      if (body.action === "create") {
        if (!results[0].ok) throw new Error(results[0].error);
        return results[0];
      }
      return { results };
    }
    if (body.action === "reset_password") {
      const p = this.t("profiles").find((x) => x.id === body.userId);
      if (!p) throw new Error("User not found");
      if (!isAdmin && (p.role !== "soldier" || !canSoldier(p.company_id))) throw new Error("You can only reset soldier passwords in your scope.");
      if (String(body.password ?? "").length < 8) throw new Error("Password must be at least 8 characters.");
      const u = this.store.auth_users.find((x) => x.id === body.userId);
      if (u) u.password = body.password;
      p.must_change_password = true;
      return { ok: true };
    }
    if (body.action === "update") {
      if (!isAdmin) throw new Error("Only Adjt / 2IC / CO / Admin can change roles.");
      const p = this.t("profiles").find((x) => x.id === body.userId);
      if (!p) throw new Error("User not found");
      if (body.userId === me.id && !["admin", "co", "2ic", "adjt"].includes(body.role)) throw new Error("You cannot remove your own super-admin role.");
      const companyId = ["admin", "co", "2ic", "adjt", "bn_rep", "clk"].includes(body.role) ? null : body.companyId ?? null;
      if (["coy_comd", "coy_rep"].includes(body.role) && !companyId) throw new Error("Coy Comd / Coy Rep must have a company");
      const old = { ...p };
      const staff = body.role !== "soldier";
      Object.assign(p, { role: body.role, company_id: companyId, active: body.active !== false });
      if (staff) p.soldier_id = null; else if (body.soldierId !== undefined) p.soldier_id = body.soldierId || null;
      if (staff) {
        if (body.appointment !== undefined) { p.appointment = String(body.appointment || "").trim() || null; if (p.appointment) p.full_name = p.appointment; }
        if (body.heldBy !== undefined) p.held_by = String(body.heldBy || "").trim() || null;
        if (body.heldBySoldier !== undefined) p.held_by_soldier = body.heldBySoldier || null;
      }
      this.afterWrite("profiles", "UPDATE", p, old);
      return { ok: true };
    }
    if (body.action === "delete") {
      if (!isAdmin) throw new Error("Only Adjt / 2IC / CO / Admin can delete accounts.");
      if (body.userId === me.id) throw new Error("You cannot delete your own account.");
      this.store.profiles = this.t("profiles").filter((p) => p.id !== body.userId);
      this.store.auth_users = this.store.auth_users.filter((u) => u.id !== body.userId);
      return { ok: true };
    }
    throw new Error("Unknown action");
  }

  // ---------------------------------------------------- demo history
  /** Builds finalized parade states for the previous days so history/reports have data. */
  private generateHistory() {
    this.asSystem(() => {
      const today = bdToday();
      for (let i = 10; i >= 1; i--) {
        const date = addDays(today, -i);
        for (const kind of ["Morning", "Second"]) {
          const w = this.paradeWindow(date, kind);
          const st = { id: uuid(), date, state_type: kind === "Morning" ? "Morning State" : "2nd Parade State", kind, ...w, display_order: kind === "Morning" ? 1 : 2, status: "Open", created_by: null, finalized_by: null, finalized_at: null, created_at: w.opens_at };
          this.t("parade_states").push(st);
          this.syncParadeState(st.id);
          // coys also mark standing employments (office, workshop, MT, teams …) on past states
          const EMP = ["Office", "Office", "Workshop", "MT", "MT", "Mess", "Drill Team", "Athletics Team", "Gp Training"];
          this.t("parade_entries").filter((e) => e.parade_state_id === st.id && e.state === "Present" && !e.employment).forEach((e, k) => {
            const h = (k * 7 + i * 3 + (kind === "Morning" ? 0 : 5)) % 11;
            if (h === 0) Object.assign(e, { employment: EMP[(k + i) % EMP.length], is_manual: true });
          });
          for (const s of this.t("coy_submissions").filter((x) => x.parade_state_id === st.id))
            Object.assign(s, { status: "Accepted", submitted_at: w.opens_at, reviewed_at: w.closes_at });
          Object.assign(st, { status: "Finalized", finalized_at: w.closes_at });
        }
      }
    });
  }
}

// ===========================================================================
class MockQuery implements PromiseLike<Result> {
  private kind: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private one: "single" | "maybe" | null = null;
  private payload: any = null;
  private returning = false;
  private conflict: string[] | null = null;
  private ignoreDup = false;
  private countMode = false;
  private head = false;

  constructor(private db: MockDb, private table: string) {}

  select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
    if (this.kind === "select") {
      this.countMode = !!opts?.count;
      this.head = !!opts?.head;
    } else this.returning = true;
    return this;
  }
  insert(v: any) {
    this.kind = "insert";
    this.payload = v;
    return this;
  }
  update(v: any) {
    this.kind = "update";
    this.payload = v;
    return this;
  }
  upsert(v: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.kind = "upsert";
    this.payload = v;
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }
  delete() {
    this.kind = "delete";
    return this;
  }
  eq(c: string, v: any) {
    this.filters.push((r) => same(r[c], v));
    return this;
  }
  neq(c: string, v: any) {
    this.filters.push((r) => !same(r[c], v));
    return this;
  }
  gt(c: string, v: any) {
    this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) > 0);
    return this;
  }
  gte(c: string, v: any) {
    this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) >= 0);
    return this;
  }
  lt(c: string, v: any) {
    this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) < 0);
    return this;
  }
  lte(c: string, v: any) {
    this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) <= 0);
    return this;
  }
  in(c: string, arr: any[]) {
    const set = new Set(arr.map(String));
    this.filters.push((r) => r[c] !== null && r[c] !== undefined && set.has(String(r[c])));
    return this;
  }
  is(c: string, v: any) {
    this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    return this;
  }
  not(c: string, op: string, v: any) {
    if (op === "is") this.filters.push((r) => !(v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    return this;
  }
  ilike(c: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
    this.filters.push((r) => re.test(String(r[c] ?? "")));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.rng = [a, b];
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  then<T1 = Result, T2 = never>(res?: ((v: Result) => T1 | PromiseLike<T1>) | null, rej?: ((e: any) => T2 | PromiseLike<T2>) | null) {
    return this.db.ready
      .then(() => this.exec())
      .then(res, rej);
  }

  private matches(r: Row) {
    return this.db.canRead(this.table, r) && this.filters.every((f) => f(r));
  }
  private finish(rows: Row[]): Result {
    let out = rows;
    for (const o of [...this.orders].reverse()) out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]));
    const count = out.length;
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim !== null) out = out.slice(0, this.lim);
    if (this.head) return { data: null, error: null, count };
    if (this.one) {
      if (out.length === 1) return { data: clone(out[0]), error: null, count };
      if (out.length === 0 && this.one === "maybe") return { data: null, error: null, count };
      return { data: null, error: err(out.length ? "Multiple rows returned" : "No rows found", "PGRST116"), count };
    }
    return { data: clone(out), error: null, count: this.countMode ? count : null };
  }

  private exec(): Result {
    const db = this.db;
    const table = db.t(this.table);
    try {
      if (this.kind === "select") return this.finish(table.filter((r) => this.matches(r)));

      if (this.kind === "delete") {
        const victims = table.filter((r) => this.matches(r));
        for (const v of victims) if (!db.canWrite(this.table, "delete", v)) throw new DbError(`permission denied for ${this.table}`, "42501");
        db.store[this.table] = table.filter((r) => !victims.includes(r));
        for (const v of victims) {
          db.cascadeDelete(this.table, v);
          db.afterWrite(this.table, "DELETE", v, null);
        }
        db.persist();
        return this.returning ? this.finish(victims) : { data: null, error: null };
      }

      if (this.kind === "update") {
        const targets = table.filter((r) => this.matches(r));
        const updated: Row[] = [];
        for (const t of targets) {
          const old = clone(t);
          const next = { ...t, ...clone(this.payload) };
          db.beforeWrite(this.table, next, old);
          if (!db.canWrite(this.table, "update", old) || !db.canWrite(this.table, "update", next)) continue; // RLS: silently skip, like Postgres
          db.checkUnique(this.table, next);
          Object.assign(t, next);
          db.afterWrite(this.table, "UPDATE", t, old);
          updated.push(t);
        }
        db.persist();
        return this.returning ? this.finish(updated) : { data: null, error: null };
      }

      // insert / upsert
      const items: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const written: Row[] = [];
      const pk = PK[this.table] ?? "id";
      for (const raw of items) {
        const incoming = clone(raw);
        if (this.kind === "upsert") {
          const keys = this.conflict ?? (incoming[pk] ? [pk] : UNIQUE_KEYS[this.table]?.[0] ?? [pk]);
          const existing = table.find((r) => keys.every((k) => same(r[k], incoming[k])));
          if (existing) {
            if (this.ignoreDup) continue;
            const old = clone(existing);
            const next = { ...existing, ...incoming };
            db.beforeWrite(this.table, next, old);
            if (!db.canWrite(this.table, "update", next)) throw new DbError(`new row violates row-level security policy for table "${this.table}"`, "42501");
            db.checkUnique(this.table, next);
            Object.assign(existing, next);
            db.afterWrite(this.table, "UPDATE", existing, old);
            written.push(existing);
            continue;
          }
        }
        const row: Row = { ...(DEFAULTS[this.table]?.() ?? {}), ...incoming };
        if (pk === "id" && !row.id) row.id = uuid();
        db.beforeWrite(this.table, row, null);
        if (!db.canWrite(this.table, "insert", row)) throw new DbError(`new row violates row-level security policy for table "${this.table}"`, "42501");
        db.checkUnique(this.table, row);
        table.push(row);
        db.afterWrite(this.table, "INSERT", row, null);
        written.push(row);
      }
      db.persist();
      return this.returning ? this.finish(written) : { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: err(e.message ?? String(e), e.code) };
    }
  }
}

let instance: MockDb | null = null;
export function getMockDb(): MockDb {
  if (!instance) instance = new MockDb();
  return instance;
}
