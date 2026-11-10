import type { Category, DirectoryEntry, LeaveApplication, LeaveType, ParadeEntry, Soldier, TrainingRecord, TrainingType } from "./types";
import { addDays, addStrength, daysInYear, yearsBetween, zeroStrength, type Strength } from "./utils";

// ============================================================ parade state
export interface ParadeSummary {
  posted: Strength;
  present: Strength;
  absent: Strength;
  employed: Strength;
  onParade: Strength;
  absentBy: Record<string, Strength>;
  employedBy: Record<string, Strength>;
}
export const emptySummary = (): ParadeSummary => ({
  posted: zeroStrength(), present: zeroStrength(), absent: zeroStrength(), employed: zeroStrength(), onParade: zeroStrength(), absentBy: {}, employedBy: {},
});

export function summarizeParade(entries: ParadeEntry[], dir: Map<string, Pick<DirectoryEntry, "category">>) {
  const byCompany = new Map<string, ParadeSummary>();
  const total = emptySummary();
  for (const e of entries) {
    const cat = (dir.get(e.soldier_id)?.category ?? "OR") as Category;
    const coy = byCompany.get(e.company_id) ?? emptySummary();
    byCompany.set(e.company_id, coy);
    for (const s of [coy, total]) {
      addStrength(s.posted, cat);
      if (e.state === "Absent") {
        addStrength(s.absent, cat);
        const r = e.absent_reason || "Other";
        addStrength((s.absentBy[r] ||= zeroStrength()), cat);
      } else {
        addStrength(s.present, cat);
        if (e.employment) {
          addStrength(s.employed, cat);
          addStrength((s.employedBy[e.employment] ||= zeroStrength()), cat);
        } else addStrength(s.onParade, cat);
      }
    }
  }
  return { byCompany, total };
}

// ================================================================== leave
export function leaveEnd(l: LeaveApplication): string {
  // When a soldier rejoins early (or late), the actual last day is the day before rejoining.
  return l.rejoin_date ? addDays(l.rejoin_date, -1) : l.to_date;
}
export function isOnLeave(l: LeaveApplication, date: string) {
  return l.status === "Approved" && l.from_date <= date && (l.rejoin_date ? l.rejoin_date > date : l.to_date >= date);
}
export function isOverstayed(l: LeaveApplication, date: string) {
  return l.status === "Approved" && !l.rejoin_date && l.to_date < date;
}

// ------------------------------------------------ leave due (every 3 months)
/** A soldier should go on leave every 3 months: suggest from 2 months 15 days, flag after 3 months. */
export const LEAVE_DUE_DAYS = 75;
export const LEAVE_CROSSED_DAYS = 90;
export interface LeaveDueRow {
  soldierId: string;
  lastEnd: string | null;
  days: number | null;
  level: "crossed" | "due" | "none";
  planned: LeaveApplication | null;
}
export function leaveDue(leave: LeaveApplication[], soldierIds: string[], today: string): LeaveDueRow[] {
  const by = new Map<string, LeaveApplication[]>();
  for (const l of leave) (by.get(l.soldier_id) ?? by.set(l.soldier_id, []).get(l.soldier_id)!).push(l);
  const out: LeaveDueRow[] = [];
  for (const sid of soldierIds) {
    const mine = by.get(sid) ?? [];
    if (mine.some((l) => isOnLeave(l, today) || isOverstayed(l, today))) continue; // away now
    const taken = mine.filter((l) => l.status === "Approved" && l.from_date <= today).map(leaveEnd).filter((d) => d < today).sort();
    const lastEnd = taken[taken.length - 1] ?? null;
    const days = lastEnd ? Math.round((Date.parse(today) - Date.parse(lastEnd)) / 864e5) : null;
    if (days !== null && days < LEAVE_DUE_DAYS) continue;
    const planned = mine.filter((l) => ["Applied", "Recommended", "Approved"].includes(l.status) && l.from_date > today).sort((a, b) => a.from_date.localeCompare(b.from_date))[0] ?? null;
    out.push({ soldierId: sid, lastEnd, days, level: days === null ? "none" : days >= LEAVE_CROSSED_DAYS ? "crossed" : "due", planned });
  }
  return out.sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
}
/** "2 m 20 d" */
export const monthsDays = (days: number | null) => (days === null ? "—" : `${Math.floor(days / 30)} m ${days % 30} d`);

export interface LeaveBalanceRow {
  type: LeaveType;
  quota: number | null;
  used: number;
  pending: number;
  remaining: number | null;
}
export function leaveBalance(leaves: LeaveApplication[], types: LeaveType[], year: number): LeaveBalanceRow[] {
  return types
    .filter((t) => t.active)
    .map((type) => {
      const mine = leaves.filter((l) => l.leave_type_id === type.id);
      const used = mine.filter((l) => l.status === "Approved").reduce((n, l) => n + daysInYear(l.from_date, leaveEnd(l), year), 0);
      const pending = mine.filter((l) => l.status === "Applied" || l.status === "Recommended").reduce((n, l) => n + daysInYear(l.from_date, l.to_date, year), 0);
      return { type, quota: type.annual_quota, used, pending, remaining: type.annual_quota === null ? null : type.annual_quota - used };
    });
}

// ================================================================ training
export type TrainingState = "Completed" | "Partial" | "Ongoing" | "Not Started" | "Failed" | "Exempted" | "Not Applicable";
export interface TrainingStatus {
  state: TrainingState;
  done: number;
  required: number;
  lastResult?: TrainingRecord;
  failedSeq: number[];
  /** why Exempted, e.g. "Age 45+" or "Med Cat B" */
  reason?: string;
}

// ---------------------------------------------------- automatic exemption
/** Who is excused from which tests without a record (Settings > Training). */
export interface ExemptionRules { age: number | null; med_cats: string[]; tests: string[] }
export const DEFAULT_EXEMPTION: ExemptionRules = { age: 45, med_cats: ["B", "C", "D"], tests: ["IPFT", "RET", "SM"] };
let RULES: ExemptionRules = DEFAULT_EXEMPTION;
export function setExemptionRules(r?: Partial<ExemptionRules> | null) {
  RULES = { ...DEFAULT_EXEMPTION, ...(r ?? {}) };
}
export type ExemptionSubject = { category: string; date_of_birth?: string | null; medical_category?: string | null };
/** "Age 45+" / "Med Cat B" when the soldier is excused from this test by rule, else null. */
export function autoExemption(type: Pick<TrainingType, "code">, s: ExemptionSubject, onDate?: string): string | null {
  if (!RULES.tests.includes(type.code)) return null;
  if (s.medical_category && RULES.med_cats.includes(s.medical_category)) return `Med Cat ${s.medical_category}`;
  if (RULES.age && s.date_of_birth) {
    const age = yearsBetween(s.date_of_birth, onDate);
    if (age !== null && age >= RULES.age) return `Age ${RULES.age}+`;
  }
  return null;
}
export function trainingStatus(type: TrainingType, soldier: ExemptionSubject, records: TrainingRecord[]): TrainingStatus {
  const required = type.frequency;
  if (!type.applies_to.includes(soldier.category as Category)) return { state: "Not Applicable", done: 0, required, failedSeq: [] };
  const mine = records.filter((r) => r.training_type_id === type.id).sort((a, b) => a.sequence_no - b.sequence_no || a.attempt_no - b.attempt_no);
  if (mine.some((r) => r.result === "Exempted")) return { state: "Exempted", done: 0, required, failedSeq: [], lastResult: mine[mine.length - 1], reason: mine.find((r) => r.result === "Exempted")?.remarks || undefined };
  const auto = autoExemption(type, soldier);
  if (auto && new Set(mine.filter((r) => r.result === "Pass").map((r) => r.sequence_no)).size < required)
    return { state: "Exempted", done: 0, required, failedSeq: [], lastResult: mine[mine.length - 1], reason: auto };
  const passed = new Set(mine.filter((r) => r.result === "Pass").map((r) => r.sequence_no));
  const failedSeq = [...new Set(mine.filter((r) => r.result === "Fail" && !passed.has(r.sequence_no)).map((r) => r.sequence_no))];
  const done = Math.min(passed.size, required);
  let state: TrainingState = done >= required ? "Completed" : failedSeq.length ? "Failed" : done > 0 ? "Partial" : "Not Started";
  if (isCompletionType(type) && state === "Failed") state = done > 0 ? "Partial" : "Not Started";
  // Group Training: Completed / On going / Yet to complete
  if (hasOngoing(type) && state !== "Completed" && mine.some((r) => r.result === "Ongoing" && !passed.has(r.sequence_no))) state = "Ongoing";
  return { state, done, required, failedSeq, lastResult: mine[mine.length - 1] };
}
export const TRAINING_STATE_TONE: Record<TrainingState, string> = {
  Completed: "green",
  Partial: "blue",
  Ongoing: "blue",
  "Not Started": "grey",
  Failed: "red",
  Exempted: "amber",
  "Not Applicable": "grey",
};

/** Display name of a required occurrence, e.g. "1st Bi-Annual" or "Spd March 3". */
export function seqName(type: Pick<TrainingType, "sequence_names" | "sequence_label" | "frequency">, n: number): string {
  return type.sequence_names?.[n - 1] || (type.frequency > 1 ? `${type.sequence_label} ${n}` : type.sequence_label);
}
export const seqOptions = (type?: TrainingType | null) =>
  type ? Array.from({ length: type.frequency }, (_, i) => ({ value: String(i + 1), label: seqName(type, i + 1) })) : [];

export type SeqState = "Pass" | "Fail" | "Ongoing" | "Exempted" | "Not Started" | "Not Applicable";
export const emptySeqGroups = <T,>(): Record<SeqState, T[]> => ({ Pass: [], Fail: [], Ongoing: [], Exempted: [], "Not Started": [], "Not Applicable": [] });
/** Result of one occurrence (e.g. IPFT 2nd Bi-Annual) for a soldier. */
export function seqStatus(type: TrainingType, soldier: ExemptionSubject, records: TrainingRecord[], seq: number): { state: SeqState; last?: TrainingRecord; attempts: number; reason?: string } {
  if (!type.applies_to.includes(soldier.category as Category)) return { state: "Not Applicable", attempts: 0 };
  const mine = records.filter((r) => r.training_type_id === type.id && (r.sequence_no === seq || r.result === "Exempted")).sort((a, b) => a.attempt_no - b.attempt_no);
  const inSeq = mine.filter((r) => r.sequence_no === seq);
  const last = inSeq[inSeq.length - 1];
  if (mine.some((r) => r.result === "Exempted")) return { state: "Exempted", last, attempts: inSeq.length, reason: mine.find((r) => r.result === "Exempted")?.remarks || undefined };
  if (inSeq.some((r) => r.result === "Pass")) return { state: "Pass", last, attempts: inSeq.length };
  const auto = autoExemption(type, soldier);
  if (auto) return { state: "Exempted", last, attempts: inSeq.length, reason: auto };
  if (inSeq.some((r) => r.result === "Fail") && !isCompletionType(type)) return { state: "Fail", last, attempts: inSeq.length };
  if (hasOngoing(type) && last?.result === "Ongoing") return { state: "Ongoing", last, attempts: inSeq.length };
  return { state: "Not Started", last, attempts: inSeq.length };
}

// ---- how results are named and coloured for each kind of test
/** Tests such as Group Training are recorded as Completed / On going / Yet to complete (no pass or fail). */
export const isCompletionType = (t?: { code?: string; completion_only?: boolean } | null) => !!t && (!!t.completion_only || t.code === "GT" || t.code === "SM");
/** Group Training also has "On going"; Speed March and others: Completed / Yet to complete / Exempted. */
export const hasOngoing = (t?: { code?: string } | null) => t?.code === "GT";

/** Occurrence states shown in charts, in order. */
export const seqStatesFor = (t?: TrainingType | null): SeqState[] =>
  hasOngoing(t) ? ["Pass", "Ongoing", "Not Started"] : isCompletionType(t) ? ["Pass", "Not Started", "Exempted"] : ["Pass", "Fail", "Exempted", "Not Started"];

/** Display label of a state / result (English; pass through t() for Bangla). */
export function resultLabel(t: { code?: string; completion_only?: boolean } | null | undefined, state: string): string {
  if (isCompletionType(t)) {
    if (state === "Pass" || state === "Completed") return "Completed";
    if (state === "Ongoing" || (state === "Partial" && hasOngoing(t))) return "On going";
    if (state === "Exempted" || state === "Perm Atts" || state === "Not Applicable") return state;
    return "Yet to complete";
  }
  return state === "Not Started" ? "Yet to appear" : state;
}
/** Colour of a state for this kind of test. */
export function resultColor(t: { code?: string; completion_only?: boolean } | null | undefined, state: string): string {
  const label = resultLabel(t, state);
  const map: Record<string, string> = {
    // v3.5 — one clearly different colour per indicator
    Pass: "#2e8b57", Completed: "#2e8b57", "Not completed": "#d64541", "On going": "#2f78b7", Ongoing: "#2f78b7", "Yet to complete": "#e8a33d", Fail: "#d64541", Failed: "#d64541", Partial: "#2f78b7",
    Exempted: "#7a5bc7", "Yet to appear": "#b9c4cc", "Perm Atts": "#3d4b59", Absent: "#8a6d3b",
  };
  return map[label] ?? map[state] ?? "#8a96a0";
}
/** Text colour on top of resultColor(). */
export const resultInk = (t: { code?: string; completion_only?: boolean } | null | undefined, state: string) => (resultLabel(t, state) === "Yet to appear" ? "#3a4752" : "#fff");
/** Result options when recording (value stored → label shown). */
export const resultOptions = (t?: TrainingType | null): Array<{ value: "Pass" | "Fail" | "Ongoing" | "Exempted" | "Absent"; label: string }> =>
  hasOngoing(t)
    ? [{ value: "Pass", label: "Completed" }, { value: "Ongoing", label: "On going" }, { value: "Fail", label: "Yet to complete" }]
    : isCompletionType(t)
    ? [{ value: "Pass", label: "Completed" }, { value: "Fail", label: "Yet to complete" }, { value: "Exempted", label: "Exempted" }]
    : [{ value: "Pass", label: "Pass" }, { value: "Fail", label: "Fail" }, { value: "Exempted", label: "Exempted" }, { value: "Absent", label: "Absent" }];

/** Next sequence / attempt to record for a soldier, e.g. Speed March No 3 or IPFT period 2 attempt 1. */
export function suggestNext(type: TrainingType, records: TrainingRecord[], month: number): { sequence_no: number; attempt_no: number } {
  const mine = records.filter((r) => r.training_type_id === type.id);
  if (type.code === "IPFT" || /bi-?annual|period/i.test(type.sequence_label)) {
    const period = type.frequency === 2 ? (month <= 6 ? 1 : 2) : 1;
    const inPeriod = mine.filter((r) => r.sequence_no === period);
    if (inPeriod.some((r) => r.result === "Pass")) return { sequence_no: period, attempt_no: Math.min(inPeriod.length + 1, type.max_attempts) };
    return { sequence_no: period, attempt_no: Math.min(inPeriod.length + 1, type.max_attempts) };
  }
  const passed = new Set(mine.filter((r) => r.result === "Pass").map((r) => r.sequence_no));
  for (let s = 1; s <= type.frequency; s++) {
    if (!passed.has(s)) {
      const attempts = mine.filter((r) => r.sequence_no === s).length;
      return { sequence_no: s, attempt_no: Math.min(attempts + 1, type.max_attempts) };
    }
  }
  return { sequence_no: type.frequency, attempt_no: 1 };
}
