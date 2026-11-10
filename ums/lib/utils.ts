import type { AppSettings, Category, DirectoryEntry, Soldier } from "./types";

// ---------------------------------------------------------------- dates
// All dates are ISO strings "YYYY-MM-DD", interpreted in Bangladesh time.
export function bdToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function bdNowTime(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
const toUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
export function addDays(iso: string, n: number): string {
  return new Date(toUTC(iso) + n * 86400000).toISOString().slice(0, 10);
}
/** The week runs Sunday to Saturday; Friday and Saturday are the weekly govt holidays. */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const weekday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
export const weekStart = (iso: string) => addDays(iso, -weekday(iso));
export const isWeekend = (iso: string) => weekday(iso) === 5 || weekday(iso) === 6;
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}
export function currentYear(): number {
  return Number(bdToday().slice(0, 4));
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[Number(m) - 1]}${withYear ? " " + y.slice(2) : ""}`;
}
/** 24 Oct 2026 — four-digit year, used in printed / PDF documents. */
export function fmtDateFull(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(toUTC(iso));
  let bn = false;
  try {
    bn = typeof window !== "undefined" && window.localStorage.getItem("ums-lang") === "bn";
  } catch {
    /* ignore */
  }
  return dt.toLocaleDateString(bn ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
export function inRange(date: string, from: string | null, to: string | null) {
  return (!from || from <= date) && (!to || to >= date);
}
/** Days of [from,to] that fall inside a calendar year. */
export function daysInYear(from: string, to: string, year: number): number {
  const a = from > `${year}-01-01` ? from : `${year}-01-01`;
  const b = to < `${year}-12-31` ? to : `${year}-12-31`;
  return b >= a ? diffDays(b, a) + 1 : 0;
}

// ------------------------------------------------- years / months spans
/** Fractional years between two ISO dates (b defaults to today). */
export function yearsBetween(a: string | null | undefined, b: string = bdToday()): number | null {
  if (!a) return null;
  return diffDays(b, a) / 365.2425;
}
export function ymLabel(years: number | null): string {
  if (years === null || Number.isNaN(years)) return "—";
  const neg = years < 0;
  const total = Math.floor(Math.abs(years) * 12 + 1e-6);
  const y = Math.floor(total / 12);
  const m = total % 12;
  const s = y && m ? `${y}y ${m}m` : y ? `${y}y` : `${m}m`;
  return neg ? `−${s}` : s;
}

// ------------------------------------------------------ soldier metrics
export function ageYears(s: Pick<Soldier, "date_of_birth">) {
  return yearsBetween(s.date_of_birth);
}
export function serviceYears(s: Pick<Soldier, "date_of_enrolment">) {
  return yearsBetween(s.date_of_enrolment);
}
/** Retirement date from the record, else an estimate from Settings > retirement rules. */
export function retirementDate(s: Soldier, settings?: AppSettings): { date: string | null; estimated: boolean } {
  if (s.retirement_date) return { date: s.retirement_date, estimated: false };
  const rules = settings?.retirement_rules;
  if (!rules) return { date: null, estimated: false };
  const candidates: string[] = [];
  const svc = rules.svc_years_by_rank?.[s.rank];
  if (svc && s.date_of_enrolment) candidates.push(addYears(s.date_of_enrolment, svc));
  const age = rules.age_limit_by_category?.[s.category];
  if (age && s.date_of_birth) candidates.push(addYears(s.date_of_birth, age));
  if (!candidates.length) return { date: null, estimated: false };
  return { date: candidates.sort()[0], estimated: true };
}
export function serviceLeftYears(s: Soldier, settings?: AppSettings): number | null {
  const r = retirementDate(s, settings);
  return r.date ? diffDays(r.date, bdToday()) / 365.2425 : null;
}
function addYears(iso: string, years: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(y + Math.floor(years)).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function heightLabel(inches: number | null | undefined): string {
  if (!inches) return "—";
  const ft = Math.floor(inches / 12);
  const inch = Math.round((inches - ft * 12) * 10) / 10;
  return `${ft}'${inch}"`;
}

// --------------------------------------------------- strength format
export type Strength = { Offr: number; JCO: number; OR: number };
export const zeroStrength = (): Strength => ({ Offr: 0, JCO: 0, OR: 0 });
export function addStrength(s: Strength, cat: Category | string | undefined, n = 1) {
  if (cat === "Offr" || cat === "JCO" || cat === "OR") s[cat] += n;
  return s;
}
export const strengthTotal = (s: Strength) => s.Offr + s.JCO + s.OR;
export const strengthLabel = (s: Strength) => `${s.Offr}+${s.JCO}+${s.OR}`;

// ------------------------------------------------------------- misc
export const soldierLabel = (s: Pick<DirectoryEntry, "rank" | "name" | "snk_no"> | null | undefined) =>
  s ? `${s.snk_no} ${s.rank} ${s.name}` : "—";

export function loginEmail(personalNo: string): string {
  const trimmed = personalNo.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const domain = (process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "5sigbn.local").trim().toLowerCase();
  const local = trimmed.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "-");
  return `${local}@${domain}`;
}

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function errorMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return friendly(e.message);
  const anyE = e as { message?: string; error_description?: string; details?: string };
  return friendly(anyE.message || anyE.error_description || anyE.details || JSON.stringify(e));
}
/** Turns common database errors into plain words. */
function friendly(msg: string): string {
  if (/soldiers_snk_norm_uidx|soldiers_snk_no_key|duplicate key.*snk_no/i.test(msg)) return "This Personal No already exists in the soldiers database. Every Personal No must be unique.";
  return msg;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const r of rows) (out[key(r)] ||= []).push(r);
  return out;
}

export function sortSoldiers<T extends { category?: string; display_order?: number; snk_no?: string }>(rows: T[]): T[] {
  const order: Record<string, number> = { Offr: 0, JCO: 1, OR: 2 };
  return [...rows].sort(
    (a, b) =>
      (order[a.category ?? "OR"] ?? 3) - (order[b.category ?? "OR"] ?? 3) ||
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      String(a.snk_no).localeCompare(String(b.snk_no), undefined, { numeric: true }),
  );
}
