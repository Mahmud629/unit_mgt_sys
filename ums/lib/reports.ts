// Ready-made PDF reports built on the one common layout in lib/pdf.ts:
//   - Parade State report (any state: Morning, 2nd Parade, Durbar, Firing …)
//   - CO's Morning Brief (one page)
import {
  getParadeState, getParadeStatesForDate, listChangeRequests, listCommitments, listDuties, listIdApplications, listLeave,
  listOpenAdmissions, listParadeEntries, listProgrammes, listSoldiers, listSubmissions, listTrainingRecords,
} from "./api";
import { isOverstayed, seqStatus, summarizeParade } from "./compute";
import { exportReportPdf, type PdfSection } from "./pdf";
import type { SessionValue } from "./session";
import type { DirectoryEntry, ParadeEntry, ParadeState, TrainingRecord } from "./types";
import { addDays, bdToday, currentYear, fmtDate, fmtDateLong, fmtDateTime, fmtTime, groupBy, retirementDate, sortSoldiers, strengthLabel, strengthTotal, type Strength } from "./utils";

export type ReportCtx = Pick<SessionValue, "settings" | "companies" | "companyById" | "directoryById" | "perms" | "trainingTypes" | "leaveTypes">;

const RED = "#c0392b", AMBER = "#b36a1d", GREEN = "#2e7d4f", BLUE = "#2f78b7", NAVY = "#1c3d57", PURPLE = "#6d4fb3", TEAL = "#2c8c99";
const cell = (s?: Strength) => (s && strengthTotal(s) ? strengthLabel(s) : "–");
const person = (d?: DirectoryEntry) => (d ? `${d.rank} ${d.name}` : "—");

function rollRows(ctx: ReportCtx, list: ParadeEntry[], groupKey: (e: ParadeEntry) => string, label: string) {
  const enriched = sortSoldiers(list.map((e) => { const d = ctx.directoryById.get(e.soldier_id); return { e, d, category: d?.category, display_order: d?.display_order, snk_no: d?.snk_no }; }));
  const groups = groupBy(enriched, (x) => groupKey(x.e));
  return Object.keys(groups).sort().flatMap((k) => groups[k].map(({ e, d }) => ({
    grp: k, no: d?.snk_no ?? "", rank: d?.rank ?? "", name: d?.name ?? "", coy: ctx.companyById.get(e.company_id)?.short_name ?? "",
    loc: e.location ?? "", rmk: e.remarks ?? e.auto_note ?? "", _label: label,
  })));
}

/** Active companies the viewer may see, in order, plus any that still have entries. */
function paradeCoys(ctx: ReportCtx, withEntries: { has(id: string): boolean }) {
  return ctx.companies
    .filter((c) => withEntries.has(c.id) || (c.active !== false && ctx.perms.canViewCompany(c.id)))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/** Coy matrix with a TOTAL row, absentee roll, employed roll. */
function paradeSections(ctx: ReportCtx, entries: ParadeEntry[], o: { compact?: boolean } = {}): { sections: PdfSection[]; total: ReturnType<typeof summarizeParade>["total"] } {
  const { byCompany, total } = summarizeParade(entries, ctx.directoryById);
  const reasons = [...new Set([...ctx.settings.absent_reasons, ...Object.keys(total.absentBy)])].filter((r) => total.absentBy[r]);
  // Every active company the viewer may see is listed — one with nobody posted (e.g. EME Sec) shows dashes.
  const coys = paradeCoys(ctx, byCompany);
  const dashRow = (coy: string) => ({ coy, posted: "–", ...Object.fromEntries(reasons.map((r) => [`r:${r}`, "–"])), absent: "–", present: "–", employed: "–", parade: "–" });
  const matrix = [...coys.map((c) => ({ coy: c.short_name || c.name, s: byCompany.get(c.id) })), { coy: "TOTAL", s: total }].map(({ coy, s }) => !s ? dashRow(coy) : ({
    coy, posted: strengthLabel(s.posted), ...Object.fromEntries(reasons.map((r) => [`r:${r}`, cell(s.absentBy[r])])),
    absent: strengthLabel(s.absent), present: strengthLabel(s.present), employed: strengthLabel(s.employed), parade: strengthLabel(s.onParade),
  }));
  const num = "center" as const;
  const sections: PdfSection[] = [{
    title: "Company-wise state (Offr+JCO+OR)", color: NAVY, serial: false, totalRow: true,
    columns: [
      { header: "Coy", key: "coy" }, { header: "Posted", key: "posted", align: num },
      ...reasons.map((r) => ({ header: r, key: `r:${r}`, align: num })),
      { header: "Total Absent", key: "absent", align: num }, { header: "Present", key: "present", align: num },
      { header: "Employed", key: "employed", align: num }, { header: "On Parade", key: "parade", align: num },
    ],
    rows: matrix,
    colorize: (k, v) => (k === "absent" && v !== "0+0+0" ? RED : k === "parade" ? GREEN : null),
  }];
  if (!o.compact) {
    const cols = (grp: string) => [
      { header: grp, key: "grp" }, { header: "Personal No", key: "no" }, { header: "Rank", key: "rank" }, { header: "Name", key: "name" },
      { header: "Coy", key: "coy" }, { header: "Location", key: "loc" }, { header: "Remarks", key: "rmk" },
    ];
    sections.push(
      { title: "Absentees", color: RED, columns: cols("Reason"), rows: rollRows(ctx, entries.filter((e) => e.state === "Absent"), (e) => e.absent_reason ?? "Other", "Reason"), empty: "Nobody absent",
        colorize: (k, v) => (k === "grp" && /AWOL|Detention|Overstay/i.test(v) ? RED : null) },
      { title: "Employed", color: PURPLE, columns: cols("Employment"), rows: rollRows(ctx, entries.filter((e) => e.state === "Present" && e.employment), (e) => e.employment!, "Employment"), empty: "Nobody employed" },
    );
  }
  return { sections, total };
}

/** The Parade State report of one state, in the common PDF layout. */
export async function exportParadeStatePdf(ctx: ReportCtx, stateId: string) {
  const st = await getParadeState(stateId);
  if (!st) throw new Error("Parade state not found");
  const [all, subs] = await Promise.all([listParadeEntries(stateId), listSubmissions(stateId)]);
  const entries = all.filter((e) => ctx.perms.canViewCompany(e.company_id));
  const { sections, total } = paradeSections(ctx, entries);
  const subRows = paradeCoys(ctx, new Set(entries.map((e) => e.company_id))).map((c) => {
    const s = subs.find((x) => x.company_id === c.id);
    return { coy: c.name, status: s?.status ?? "Draft", at: s?.submitted_at ? fmtDateTime(s.submitted_at) : "", rmk: s?.remarks ?? "" };
  });
  sections.push({
    title: "Company submissions", color: TEAL, columns: [{ header: "Coy", key: "coy" }, { header: "Status", key: "status" }, { header: "Submitted", key: "at" }, { header: "Remarks", key: "rmk" }],
    rows: subRows, colorize: (k, v) => (k === "status" ? (v === "Accepted" ? GREEN : v === "Returned" ? RED : v === "Submitted" ? BLUE : AMBER) : null),
  });
  await exportReportPdf({
    filename: `Parade_State_${st.date}_${st.state_type}`,
    unit: ctx.settings.unit.name,
    title: `${st.state_type} — ${fmtDate(st.date)}`,
    subtitle: `${fmtDateLong(st.date)} · ${st.status}${st.finalized_at ? ` at ${fmtDateTime(st.finalized_at)}` : ""} · Figures as Offr+JCO+OR`,
    chips: [
      { label: "Posted", value: strengthLabel(total.posted), color: NAVY },
      { label: "Present", value: strengthLabel(total.present), color: GREEN },
      { label: "On Parade", value: strengthLabel(total.onParade), color: "#3f8f55" },
      { label: "Employed", value: strengthLabel(total.employed), color: PURPLE },
      { label: "Absent", value: strengthLabel(total.absent), color: RED },
      { label: "Status", value: st.status, color: st.status === "Finalized" ? GREEN : AMBER },
    ],
    sections,
    orientation: "landscape",
  });
}

const pickMorning = (states: ParadeState[]) =>
  states.find((s) => s.kind === "Morning") ?? [...states].sort((a, b) => (a.display_order ?? 9) - (b.display_order ?? 9))[0] ?? null;

/** CO's Morning Brief — the whole unit on one page. */
export async function exportMorningBrief(ctx: ReportCtx, date = bdToday()) {
  const year = currentYear();
  const states = await getParadeStatesForDate(date);
  const morning = pickMorning(states);
  const [entries, leave, admissions, duties, prog, commits, soldiers, records, reqs, apps] = await Promise.all([
    morning ? listParadeEntries(morning.id) : Promise.resolve([] as ParadeEntry[]),
    listLeave({ from: addDays(date, -60), to: addDays(date, 30) }),
    listOpenAdmissions(),
    listDuties(date, date),
    listProgrammes(date, date),
    listCommitments(date, date).catch(() => []),
    listSoldiers(),
    listTrainingRecords({ year }),
    listChangeRequests({ status: "Pending" }).catch(() => []),
    listIdApplications("Pending").catch(() => []),
  ]);
  const dir = ctx.directoryById;
  const visible = (coy: string | null | undefined) => ctx.perms.canViewCompany(coy);
  const coyOf = (id: string | null | undefined) => (id ? ctx.companyById.get(id)?.short_name ?? "" : "");
  const leaveName = (id: string) => ctx.leaveTypes.find((t) => t.id === id)?.code ?? ctx.leaveTypes.find((t) => t.id === id)?.name ?? "Leave";

  const scoped = entries.filter((e) => visible(e.company_id));
  const { sections: parade, total } = paradeSections(ctx, scoped, { compact: true });

  // alarms: AWOL / detention / overstay / hospital
  const alarms = [
    ...scoped.filter((e) => e.state === "Absent" && /AWOL|Detention/i.test(e.absent_reason ?? "")).map((e) => ({ what: e.absent_reason!, who: person(dir.get(e.soldier_id)), coy: coyOf(e.company_id), rmk: e.location ?? e.remarks ?? "" })),
    ...leave.filter((l) => visible(l.company_id) && isOverstayed(l, date)).map((l) => ({ what: "Overstay", who: person(dir.get(l.soldier_id)), coy: coyOf(l.company_id), rmk: `Due back ${fmtDate(l.to_date)} (${Math.max(0, Math.round((Date.parse(date) - Date.parse(l.to_date)) / 864e5))} days)` })),
    ...admissions.filter((a) => visible(a.company_id)).map((a) => ({ what: "Admitted", who: person(dir.get(a.soldier_id)), coy: coyOf(a.company_id), rmk: [a.hospital, a.complaint, `since ${fmtDate(a.report_date, false)}`].filter(Boolean).join(" · ") })),
  ];
  const out = leave.filter((l) => visible(l.company_id) && l.status === "Approved" && l.from_date === date);
  const back = leave.filter((l) => visible(l.company_id) && l.status === "Approved" && !l.rejoin_date && l.to_date === addDays(date, -1));
  const leaveRows = [
    ...out.map((l) => ({ move: "Out today", who: person(dir.get(l.soldier_id)), coy: coyOf(l.company_id), type: leaveName(l.leave_type_id), dates: `${fmtDate(l.from_date, false)}–${fmtDate(l.to_date, false)}` })),
    ...back.map((l) => ({ move: "Due back", who: person(dir.get(l.soldier_id)), coy: coyOf(l.company_id), type: leaveName(l.leave_type_id), dates: `${fmtDate(l.from_date, false)}–${fmtDate(l.to_date, false)}` })),
  ];

  // officers' commitments: manual ones + duty offr + officers on leave
  const offr = (id: string) => dir.get(id)?.category === "Offr";
  const coName = [...dir.values()].find((d) => d.category === "Offr" && /^Lt Col/i.test(d.rank));
  const commitRows = [
    ...commits.map((c) => ({ time: c.time_from ? `${fmtTime(c.time_from)}${c.time_to ? `–${fmtTime(c.time_to)}` : ""}` : "All day", who: person(dir.get(c.soldier_id)), what: c.title, venue: c.venue ?? "", _co: coName?.id === c.soldier_id ? 0 : 1, _t: c.time_from ?? "" })),
    ...duties.filter((d) => offr(d.soldier_id)).map((d) => ({ time: d.shift ?? "24 hrs", who: person(dir.get(d.soldier_id)), what: d.duty_type, venue: "", _co: 2, _t: "" })),
    ...leave.filter((l) => offr(l.soldier_id) && l.status === "Approved" && l.from_date <= date && (l.rejoin_date ? l.rejoin_date > date : l.to_date >= date)).map((l) => ({ time: "—", who: person(dir.get(l.soldier_id)), what: `On ${leaveName(l.leave_type_id)} till ${fmtDate(l.to_date, false)}`, venue: "", _co: 3, _t: "" })),
  ].sort((a, b) => a._co - b._co || a._t.localeCompare(b._t));

  const dutyRows = duties.filter((d) => !offr(d.soldier_id)).map((d) => ({ duty: d.duty_type, shift: d.shift ?? "", who: person(dir.get(d.soldier_id)), coy: coyOf(d.company_id) }));
  const progRows = prog.filter((p) => p.status !== "Cancelled" && (!p.company_id || visible(p.company_id)))
    .sort((a, b) => String(a.time_from).localeCompare(String(b.time_from)))
    .map((p) => ({ time: p.time_from ? `${fmtTime(p.time_from)}${p.time_to ? `–${fmtTime(p.time_to)}` : ""}` : "", what: p.activity, who: [p.participants, coyOf(p.company_id)].filter(Boolean).join(" · "), venue: p.venue ?? "" }));

  // training %
  const serving = soldiers.filter((s) => s.status === "Serving" && s.atts_type !== "Perm Atts" && visible(s.company_id));
  const recBy = new Map<string, TrainingRecord[]>();
  for (const r of records) (recBy.get(r.soldier_id) ?? recBy.set(r.soldier_id, []).get(r.soldier_id)!).push(r);
  const trgRows = ctx.trainingTypes.filter((t) => t.active).flatMap((type) => Array.from({ length: type.frequency }, (_, i) => i + 1).map((n) => {
    let pass = 0, ex = 0, fail = 0, pend = 0;
    for (const s of serving) {
      const st = seqStatus(type, s, recBy.get(s.id) ?? [], n).state;
      if (st === "Pass") pass++; else if (st === "Exempted") ex++; else if (st === "Fail") fail++; else if (st === "Not Started") pend++;
    }
    const tot = pass + ex + fail + pend;
    return { test: type.frequency > 1 ? `${type.code} ${n}` : type.code, done: pass, ex, fail, pend, pct: tot ? `${Math.round(((pass + ex) / tot) * 100)}%` : "–" };
  }));

  // admin
  const pendingLeave = leave.filter((l) => ["Applied", "Recommended"].includes(l.status) && visible(l.company_id)).length;
  const retiring = serving.filter((s) => { const r = retirementDate(s, ctx.settings).date; return r && r >= date && r <= addDays(date, 90); });
  const adminRows = [
    { item: "Leave waiting for decision", n: String(pendingLeave) },
    { item: "Profile updates / new IDs waiting", n: `${reqs.length} / ${apps.length}` },
    { item: "Retiring within 90 days", n: retiring.length ? `${retiring.length} — ${retiring.slice(0, 2).map((s) => `${s.rank} ${s.name}`).join(", ")}${retiring.length > 2 ? " …" : ""}` : "0" },
  ];

  const sections: PdfSection[] = [
    ...parade,
    { title: "Needs attention — AWOL / overstay / hospital", color: RED, half: true, columns: [{ header: "What", key: "what" }, { header: "Rank & Name", key: "who" }, { header: "Coy", key: "coy" }, { header: "Details", key: "rmk" }], rows: alarms, empty: "Nil", colorize: (k) => (k === "what" ? RED : null) },
    { title: "Leave — out today / due back", color: AMBER, half: true, columns: [{ header: "Move", key: "move" }, { header: "Rank & Name", key: "who" }, { header: "Coy", key: "coy" }, { header: "Type", key: "type" }, { header: "Dates", key: "dates" }], rows: leaveRows, empty: "Nil" },
    { title: "CO's & officers' commitments today", color: NAVY, half: true, columns: [{ header: "Time", key: "time" }, { header: "Officer", key: "who" }, { header: "Commitment", key: "what" }, { header: "Venue", key: "venue" }], rows: commitRows, empty: "Nil" },
    { title: "Programme today", color: BLUE, half: true, columns: [{ header: "Time", key: "time" }, { header: "Activity", key: "what" }, { header: "Who", key: "who" }, { header: "Venue", key: "venue" }], rows: progRows, empty: "No programme published" },
    { title: "Duties today", color: PURPLE, half: true, columns: [{ header: "Duty", key: "duty" }, { header: "Shift", key: "shift" }, { header: "Rank & Name", key: "who" }, { header: "Coy", key: "coy" }], rows: dutyRows, empty: "No duties detailed" },
    { title: `Training state ${year} (done incl. exempted)`, color: GREEN, half: true, serial: false, columns: [{ header: "Test", key: "test" }, { header: "Pass", key: "done", align: "center" }, { header: "Exempt", key: "ex", align: "center" }, { header: "Fail", key: "fail", align: "center" }, { header: "Yet to appear", key: "pend", align: "center" }, { header: "%", key: "pct", align: "center" }], rows: trgRows, empty: "No training types",
      colorize: (k, v) => (k === "pct" ? (parseInt(v) >= 90 ? GREEN : parseInt(v) >= 60 ? AMBER : RED) : null) },
    { title: "Administration", color: TEAL, serial: false, columns: [{ header: "Item", key: "item" }, { header: "Number / details", key: "n" }], rows: adminRows },
  ];
  await exportReportPdf({
    filename: `Morning_Brief_${date}`,
    unit: ctx.settings.unit.name,
    title: `CO's Morning Brief — ${fmtDate(date)}`,
    subtitle: `${fmtDateLong(date)} · ${morning ? `${morning.state_type} (${morning.status})` : "Parade state not opened"} · Figures as Offr+JCO+OR`,
    chips: [
      { label: "Posted", value: strengthLabel(total.posted), color: NAVY },
      { label: "Present", value: strengthLabel(total.present), color: GREEN },
      { label: "On Parade", value: strengthLabel(total.onParade), color: "#3f8f55" },
      { label: "Absent", value: strengthLabel(total.absent), color: RED },
      { label: "Needs attention", value: String(alarms.length), color: alarms.length ? RED : GREEN },
      { label: "Out / back today", value: `${out.length} / ${back.length}`, color: AMBER },
      { label: "Approvals waiting", value: String(pendingLeave + reqs.length + apps.length), color: BLUE },
    ],
    sections,
    compact: true,
    onePage: true,
  });
}
