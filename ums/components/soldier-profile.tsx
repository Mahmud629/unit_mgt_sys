"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Camera, Edit3, FileDown, Pencil, Plus, Printer, Send, Trash2, User, UserMinus, X } from "lucide-react";
import { exportSoldierPdf } from "@/lib/pdf";
import { Alert, Badge, Card, Empty, ErrorBox, Loading, Tabs, useAction, useAsync, useConfirm, useUndo } from "./ui";
import { FormModal, FieldInput } from "./record-modal";
import {
  cancelChangeRequest, createChangeRequest, deleteRecord, saveSoldier, getSoldier, listAudit, listChangeRequests, listCourses, listLeave, listProfilesBasic,
  listCyclePlans, listRecords, restoreRow, listSickReports, listTrainingRecords, photoUrl, saveRecord, uploadPhoto,
} from "@/lib/api";
import { isCompletionType, leaveBalance, isOnLeave, resultColor, resultInk, resultLabel, seqName, seqStatus, trainingStatus, TRAINING_STATE_TONE } from "@/lib/compute";
import {
  ALL_DISTRICTS, CYCLE_COLORS, CYCLES, LEAVE_STATUS_TONE, RECORD_KINDS, cycleActivityOn, cycleOf, REQUESTABLE_FIELDS, REQUESTABLE_KINDS, SOLDIER_FIELDS, SOLDIER_FIELD_GROUPS, divisionOf, fieldLabel,
  type FieldDef,
} from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { ProfileChangeRequest, RecordKind, Soldier, SoldierRecord } from "@/lib/types";
import { addDays, ageYears, bdToday, currentYear, fmtDate, fmtDateFull, fmtDateTime, heightLabel, retirementDate, serviceLeftYears, serviceYears, ymLabel } from "@/lib/utils";

type TabKey = "overview" | "family" | "education" | "service" | "training" | "leave" | "medical" | "discipline" | "vehicles" | "requests";

export function SoldierProfile({ soldierId, self = false }: { soldierId: string; self?: boolean }) {
  const { perms, companyById, leaveTypes, trainingTypes, settings } = useSession();
  const { nameOf, t: tr } = useI18n();
  const [tab, setTab] = useState<TabKey>("overview");
  const [year, setYear] = useState(currentYear());
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [recordModal, setRecordModal] = useState<{ kind: RecordKind; rec?: SoldierRecord; request?: boolean } | null>(null);
  const [editRequest, setEditRequest] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const s = await getSoldier(soldierId);
    if (!s) throw new Error("Soldier not found or you do not have access.");
    const [records, leave, training, courses, sick, reqs, photo, plans] = await Promise.all([
      listRecords(soldierId), listLeave({ soldierId }), listTrainingRecords({ soldierId }), listCourses({ soldierId }),
      listSickReports({ soldierId }), listChangeRequests({ soldierId }), photoUrl(s.photo_path),
      listCyclePlans(currentYear(), soldierId).catch(() => []),
    ]);
    const audit = perms.canEditSettings ? await listAudit({ recordId: soldierId, limit: 50 }).catch(() => []) : [];
    const people = perms.canEditSettings ? await listProfilesBasic().catch(() => []) : [];
    return { s, records, leave, training, courses, sick, reqs, photo, audit, people, plan: plans[0] ?? null };
  }, [soldierId]);

  const s = data?.s;
  const canEdit = !!s && !self && perms.canEditCompany(s.company_id);
  const byKind = useMemo(() => {
    const m: Partial<Record<RecordKind, SoldierRecord[]>> = {};
    for (const r of data?.records ?? []) (m[r.kind] ||= []).push(r);
    for (const k of Object.keys(m) as RecordKind[]) {
      const dk = RECORD_KINDS[k].dateKey;
      m[k]!.sort((a, b) => String(dk ? b.data[dk] ?? "" : "").localeCompare(String(dk ? a.data[dk] ?? "" : "")));
    }
    return m;
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s || !data) return null;

  const retire = retirementDate(s, settings);
  const company = companyById.get(s.company_id);
  const pending = data.reqs.filter((r) => r.status === "Pending");
  const today = bdToday();
  const onLeave = data.leave.find((l) => isOnLeave(l, today));
  const nowActivity = cycleActivityOn(data.plan, today);
  const reportTitle = s.category === "Offr" ? "Officer's Progress Reports (OPR)" : "Annual Progress Reports (APR)";
  const lastReports = (byKind.report ?? []).slice(0, 3);

  async function onPhoto(file: File | undefined) {
    if (!file || !s) return;
    await run(async () => { await uploadPhoto(s.id, file); reload(); }, "Photo updated");
  }

  async function saveRec(kind: RecordKind, values: Record<string, string>, rec?: SoldierRecord, asRequest?: boolean) {
    const def = RECORD_KINDS[kind];
    const data2 = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
    const record_date = def.dateKey ? values[def.dateKey] || null : null;
    if (asRequest) {
      await run(async () => {
        await createChangeRequest({ soldier_id: soldierId, changes: {}, old_values: {}, note: null, record_ops: [{ op: rec ? "update" : "add", kind, id: rec?.id, record_date, data: data2 }] });
        setRecordModal(null);
        reload();
      }, "Request sent for approval");
      return;
    }
    await run(async () => {
      await saveRecord({ id: rec?.id, soldier_id: soldierId, kind, data: data2, record_date });
      setRecordModal(null);
      reload();
    }, "Saved");
  }
  async function removeRec(rec: SoldierRecord, asRequest: boolean) {
    if (asRequest && !confirm("Request removal of this entry?")) return;
    if (asRequest) await run(async () => { await createChangeRequest({ soldier_id: soldierId, changes: {}, old_values: {}, note: null, record_ops: [{ op: "delete", kind: rec.kind, id: rec.id }] }); reload(); }, "Removal requested");
    else await undoable({ text: "Entry deleted", act: () => deleteRecord(rec.id), undo: () => restoreRow("soldier_records", rec), after: reload });
  }

  async function downloadPdf() {
    if (!s || !data) return;
    const yr = currentYear();
    const COL: Record<string, string> = { "Unit Posting": "#2f78b7", Service: "#4f6f52", "Physical & Medical": "#2c9fb9", Personal: "#7a5bc7", "Home & Contact": "#b36a1d", "Emergency Contact": "#c4483f", Attachment: "#e58b2a", Remarks: "#5b7083" };
    const val = (f: FieldDef) => { if (f.type === "date") return fmtDateFull((s as unknown as Record<string, string | null>)[f.key]); const x = displayValue(f, s, companyById); return x === "—" ? "" : x; };
    const short: Record<string, string> = { "Distance from International Boundary (km)": "Dist from Intl Border (km)", "Date of Enrolment / Commission": "Date of Enrolment", "Retirement / LPR Date": "Retirement / LPR" };
    const groups = SOLDIER_FIELD_GROUPS.filter((g) => g.title !== "Identity")
      .map((g) => ({ title: g.title, color: COL[g.title] ?? "#1c3d57", rows: [...g.fields.filter((f) => f.key !== "company_id").map((f) => [short[f.label] ?? f.label, val(f)] as [string, string]), ...(g.title === "Home & Contact" ? [["Home Division", s.home_division ?? ""] as [string, string]] : [])] }))
      .filter((g) => !["Attachment", "Remarks"].includes(g.title) || g.rows.some(([, v]) => v));
    const rec = (k: RecordKind) => (byKind[k] ?? []);
    const yrRecs = data.training.filter((r) => r.year === yr);
    await run(async () => {
      await exportSoldierPdf({
        unit: settings.unit.name, photo: data.photo, name: s.name, nameBn: s.name_bn,
        line1: `${s.rank} · ${s.snk_no} · ${s.category}`,
        line2: [company?.name, s.trade, s.platoon, s.appointment].filter(Boolean).join(" · "),
        status: s.status,
        facts: [
          { label: "Age", value: ymLabel(ageYears(s)), color: "#1c3d57" },
          { label: "Service", value: ymLabel(serviceYears(s)), color: "#4f6f52" },
          { label: "Service left", value: ymLabel(serviceLeftYears(s, settings)), color: "#b36a1d" },
          { label: "Retirement", value: `${fmtDateFull(retire.date)}${retire.estimated ? "*" : ""}`, color: "#7a5bc7" },
          { label: "Height", value: heightLabel(s.height_in), color: "#2c9fb9" },
          { label: "Blood", value: s.blood_group ?? "—", color: "#c4483f" },
          { label: "Med Cat", value: s.medical_category ?? "—", color: "#2f78b7" },
          { label: "Living in", value: s.accommodation ?? "—", color: "#5b7083" },
        ],
        groups,
        chips: [
          { title: `Training ${yr}`, items: trainingTypes.filter((tp) => tp.active).flatMap((tp) => Array.from({ length: tp.frequency }, (_, i) => i + 1).map((n) => { const x = seqStatus(tp, s, yrRecs, n); return { tp, n, st: x.state, why: x.reason }; })).filter((x) => x.st !== "Not Applicable")
            .map(({ tp, n, st, why }) => ({ label: `${tp.frequency > 1 ? seqName(tp, n) : tp.name}: ${resultLabel(tp, st)}${why ? ` (${why})` : ""}`, color: resultColor(tp, st), ink: resultInk(tp, st) })) },
          { title: `Leave ${yr}`, items: leaveBalance(data.leave, leaveTypes, yr).filter((b) => b.quota !== null || b.used > 0).map((b) => ({ label: `${b.type.code}: ${b.used} availed${b.remaining !== null ? ` · ${b.remaining} left` : ""}`, color: "#1f8aa3" })) },
        ],
        tables: [
          {
            title: "Military courses & results", color: "#4f6f52", first: true, always: true, empty: "No military course recorded", max: 8, colorCol: 4,
            columns: ["Course", "Institution", "From", "To", "Result / Grade"],
            rows: [
              ...rec("course").map((r) => [r.data.course ?? "", r.data.institution ?? "", fmtDateFull(r.data.from), fmtDateFull(r.data.to), r.data.result ?? ""]),
              ...data.courses.filter((c) => c.status !== "Withdrawn").map((c) => [c.course_name, c.institution ?? "", fmtDateFull(c.from_date), fmtDateFull(c.to_date),
                c.status === "Completed" || c.status === "Failed" ? [c.result ?? c.status, c.grade ? `(${c.grade})` : ""].filter(Boolean).join(" ") : c.status]),
            ].sort((a, b) => String(b[2]).localeCompare(String(a[2]))),
          },
          {
            title: `Last 3 ${s.category === "Offr" ? "OPR" : "APR"} — marks & remarks`, color: "#1c3d57", first: true, always: true, empty: "No report recorded", max: 3,
            columns: ["Year", "Report", "Marks", "Grading", "Remarks", "Initiated by"],
            rows: lastReports.map((r) => [r.data.year ?? "", r.data.type ?? "", r.data.marks ?? "", r.data.grading ?? "", r.data.remarks ?? "", r.data.initiated_by ?? ""]),
          },
          ...(data.plan ? [{
            title: `Cycle plan ${currentYear()}`, color: "#3f8f55", first: true, max: 1,
            columns: CYCLES.map((c) => `${c.label} (${c.months})`),
            rows: [CYCLES.map((c) => String(data.plan?.[c.key as "c1"] ?? "—"))],
          }] : []),
          ...(rec("vehicle").length ? [{ title: "Personal vehicles", color: "#2c8c99", max: 3, columns: ["Vehicle", "Reg No", "Licence No / valid till", "Stn HQ permission"],
            rows: rec("vehicle").map((r) => [[r.data.vehicle_type, r.data.make_model].filter(Boolean).join(" · "), r.data.reg_no ?? "", [r.data.licence_no, fmtDateFull(r.data.licence_expiry)].filter(Boolean).join(" / "), [r.data.permission, r.data.permission_no, r.data.permission_valid_till ? `till ${fmtDateFull(r.data.permission_valid_till)}` : ""].filter(Boolean).join(" · ")]) }] : []),
          { title: "Family members", color: "#7a5bc7", max: 5, columns: ["Name", "Relation", "Date of birth", "Occupation", "Mobile"], rows: rec("family").map((r) => [r.data.name ?? "", r.data.relation ?? "", fmtDateFull(r.data.date_of_birth), r.data.occupation ?? "", r.data.mobile ?? ""]) },
          { title: "Civil education", color: "#2f78b7", max: 4, columns: ["Examination", "Board / Institution", "Year", "Result"], rows: rec("education").map((r) => [r.data.exam ?? "", r.data.institution ?? "", r.data.year ?? "", r.data.result ?? ""]) },
        ],
      }, `Personal_File_${s.snk_no}_${s.name}`);
      return true;
    }, "PDF downloaded");
  }

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "overview", label: "Personal file" },
    { key: "family", label: "Family", count: byKind.family?.length ?? 0 },
    { key: "education", label: "Education & Courses" },
    { key: "service", label: "Service history" },
    { key: "training", label: "Training" },
    { key: "leave", label: "Leave", count: data.leave.length },
    { key: "medical", label: "Medical" },
    { key: "discipline", label: "Discipline & Awards" },
    { key: "vehicles", label: "Vehicles", count: byKind.vehicle?.length || undefined },
    { key: "requests", label: self ? "My requests" : "Changes & history", count: pending.length || undefined },
  ];

  const recordCard = (kind: RecordKind, extra?: React.ReactNode, title?: string, max?: number) => {
    const def = RECORD_KINDS[kind];
    const all = byKind[kind] ?? [];
    const rows = max ? all.slice(0, max) : all;
    const selfCan = self && REQUESTABLE_KINDS.includes(kind);
    return (
      <Card title={title ?? def.title} key={kind} pad={false}
        actions={(canEdit || selfCan) && <button className="btn btn-sm" onClick={() => setRecordModal({ kind, request: self })}><Plus size={13} /> {self ? "Request add" : "Add"}</button>}>
        {rows.length === 0 && !extra ? <Empty>No entries</Empty> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr>{def.fields.map((f) => <th key={f.key}>{f.label}</th>)}{(canEdit || selfCan) && <th />}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {def.fields.map((f) => <td key={f.key}>{f.type === "date" ? fmtDate(r.data[f.key]) : r.data[f.key] || "—"}</td>)}
                    {(canEdit || selfCan) && (
                      <td className="right nowrap">
                        <button className="btn btn-xs btn-ghost" onClick={() => setRecordModal({ kind, rec: r, request: self })} title="Edit"><Pencil size={12} /></button>
                        <button className="btn btn-xs btn-ghost" onClick={() => removeRec(r, self)} title="Remove"><Trash2 size={12} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {extra}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="stack">
      <div className="print-only report-title"><h2>{settings.unit.name} — Personal File</h2><p>Printed {fmtDate(today)}</p></div>
      <Card pad={false}>
        <div className="profile-hero">
          <div className="photo">
            {data.photo ? <img src={data.photo} alt={s.name} /> : <User size={40} />}
            {canEdit && <label className="photo-upload no-print"><Camera size={11} /> Photo<input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>}
          </div>
          <div className="hero-main">
            <div className="row">
              <h2>{s.rank} {nameOf(s)}</h2>
              <Badge tone={s.status === "Serving" ? "green" : "grey"}>{s.status}</Badge>
              {s.atts_type && <Badge tone="amber">{s.atts_type}: {s.atts_location}</Badge>}
              {onLeave && <Badge tone="blue">On leave till {fmtDate(onLeave.to_date)}</Badge>}
            </div>
            <div className="sub"><span className="mono strong">{s.snk_no}</span> · {s.category} · {s.trade ?? "—"} · {company?.name}{s.platoon ? ` · ${s.platoon}` : ""}{s.appointment ? ` · ${s.appointment}` : ""}</div>
            {s.name_bn && <div className="sub">{s.name_bn}</div>}
            <div className="hero-facts">
              <div className="fact"><span>Age</span><strong>{ymLabel(ageYears(s))}</strong></div>
              <div className="fact"><span>Service</span><strong>{ymLabel(serviceYears(s))}</strong></div>
              <div className="fact"><span>Service left</span><strong>{ymLabel(serviceLeftYears(s, settings))}</strong></div>
              <div className="fact"><span>Retirement</span><strong>{fmtDate(retire.date)}{retire.estimated ? "*" : ""}</strong></div>
              <div className="fact"><span>Height</span><strong>{heightLabel(s.height_in)}</strong></div>
              <div className="fact"><span>Blood</span><strong>{s.blood_group ?? "—"}</strong></div>
              <div className="fact"><span>Med Cat</span><strong>{s.medical_category ?? "—"}</strong></div>
              <div className="fact"><span>Home</span><strong>{s.home_district ?? "—"}</strong></div>
              <div className="fact"><span>Living in</span><strong>{s.accommodation ?? "—"}</strong></div>
              <div className="fact" style={nowActivity ? { borderColor: CYCLE_COLORS[nowActivity] } : undefined}><span>{tr("This cycle")} (C{cycleOf(today)})</span><strong style={nowActivity ? { color: CYCLE_COLORS[nowActivity] } : undefined}>{nowActivity ? tr(nowActivity) : "—"}</strong></div>
            </div>
          </div>
          <div className="stack no-print" style={{ gap: 8, alignSelf: "flex-start" }}>
            {canEdit && <Link className="btn btn-primary" href={`/soldiers/edit?id=${s.id}`}><Edit3 size={15} /> Edit record</Link>}
            {canEdit && s.status === "Serving" && <button className="btn btn-red" onClick={() => setRemoveOpen(true)}><UserMinus size={15} /> Remove from coy</button>}
            {self && <button className="btn btn-primary" onClick={() => setEditRequest(true)}><Send size={15} /> Request changes</button>}
            <button className="btn btn-green" onClick={downloadPdf} disabled={busy}><FileDown size={15} /> {tr("Download PDF")}</button>
            <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
          </div>
        </div>
      </Card>
      {pending.length > 0 && <Alert tone="amber">{pending.length} — <span>Profile change request(s) waiting for approval.</span></Alert>}

      <div className="no-print"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>

      {tab === "overview" && (
        <div className="grid grid-2 profile-grid">
          {recordCard("report", undefined, reportTitle, 3)}
          <Card title={`${tr("Cycle plan")} ${currentYear()}`} actions={perms.canCommandCompany(s.company_id) && <Link className="btn btn-sm" href="/training/cycle-plan">{tr("Plan")}</Link>}>
            {!data.plan ? <Empty>{tr("Not planned yet")}</Empty> : (
              <div className="cycle-row">
                {CYCLES.map((c) => { const a = data.plan?.[c.key as "c1"]; return (
                  <div key={c.key} className={cycleOf(today) === c.n ? "cycle-box now" : "cycle-box"} style={a ? { borderColor: CYCLE_COLORS[a] } : undefined}>
                    <span>{tr(c.label)} · {tr(c.months)}</span><strong style={a ? { color: CYCLE_COLORS[a] } : undefined}>{a ? tr(a) : "—"}</strong>
                  </div>
                ); })}
              </div>
            )}
          </Card>
          {SOLDIER_FIELD_GROUPS.map((g) => (
            <Card title={g.title} key={g.title}>
              <dl className="dl">
                {g.fields.map((f) => (
                  <div key={f.key}><dt>{f.label}</dt><dd>{displayValue(f, s, companyById)}</dd></div>
                ))}
                {g.title === "Home & Contact" && <div><dt>Home Division</dt><dd>{s.home_division ?? "—"}</dd></div>}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {tab === "family" && recordCard("family")}
      {tab === "education" && (
        <div className="stack">
          {recordCard("education")}
          {recordCard("course")}
          <Card title="Course nominations in this unit" pad={false}>
            {data.courses.length === 0 ? <Empty>None</Empty> : (
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>Course</th><th>Institution</th><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Result</th></tr></thead>
                <tbody>{data.courses.map((c) => <tr key={c.id}><td className="strong">{c.course_name}</td><td>{c.institution}</td><td>{c.course_type}</td><td>{fmtDate(c.from_date)}</td><td>{fmtDate(c.to_date)}</td><td><Badge tone={c.status === "Completed" ? "green" : c.status === "Attending" ? "blue" : c.status === "Failed" ? "red" : "grey"}>{c.status}</Badge></td><td>{[c.result, c.grade].filter(Boolean).join(" / ") || "—"}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}
      {tab === "service" && recordCard("posting")}
      {tab === "vehicles" && (
        <Card title={tr("Personal Vehicles")} actions={(canEdit || self) && <button className="btn btn-sm" onClick={() => setRecordModal({ kind: "vehicle", request: self })}><Plus size={13} /> {self ? tr("Request add") : tr("Add vehicle")}</button>}>
          {(byKind.vehicle ?? []).length === 0 ? <Empty>{tr("No personal vehicle recorded.")}</Empty> : (
            <div className="veh-grid">
              {(byKind.vehicle ?? []).map((r) => {
                const d = r.data;
                const lic = d.licence_expiry ? (d.licence_expiry < today ? "red" : d.licence_expiry <= addDays(today, 30) ? "amber" : "green") : "grey";
                const per = d.permission === "Granted" ? (d.permission_valid_till && d.permission_valid_till < today ? "red" : d.permission_valid_till && d.permission_valid_till <= addDays(today, 30) ? "amber" : "green") : d.permission === "Not required" ? "grey" : "red";
                return (
                  <div key={r.id} className="veh-card">
                    <div className="veh-head">
                      <strong>{tr(d.vehicle_type ?? "Vehicle")}</strong><span>{[d.make_model, d.colour].filter(Boolean).join(" · ")}</span>
                      {(canEdit || self) && <span className="veh-actions"><button className="btn btn-xs btn-ghost" onClick={() => setRecordModal({ kind: "vehicle", rec: r, request: self })} title="Edit"><Pencil size={12} /></button><button className="btn btn-xs btn-ghost" onClick={() => removeRec(r, self)} title="Remove"><Trash2 size={12} /></button></span>}
                    </div>
                    <dl className="veh-dl">
                      <div><dt>{tr("Registration No")}</dt><dd className="mono">{d.reg_no || "—"}</dd></div>
                      <div><dt>{tr("Owner")}</dt><dd>{d.owner ? tr(d.owner) : "—"}</dd></div>
                      <div><dt>{tr("Driving licence No")}</dt><dd className="mono">{d.licence_no || "—"}</dd></div>
                      <div><dt>{tr("Licence")}</dt><dd>{d.licence_type ? tr(d.licence_type) : "—"} {d.licence_expiry && <Badge tone={lic}>{tr("till")} {fmtDate(d.licence_expiry)}</Badge>}</dd></div>
                      <div><dt>{tr("Stn HQ permission")}</dt><dd><Badge tone={per}>{tr(d.permission || "Not applied")}</Badge> {d.permission_no && <span className="mono small">{d.permission_no}</span>}</dd></div>
                      <div><dt>{tr("Permission valid")}</dt><dd>{d.permission_date || d.permission_valid_till ? `${fmtDate(d.permission_date) || "—"} – ${fmtDate(d.permission_valid_till) || "—"}` : "—"}</dd></div>
                    </dl>
                    {d.remarks && <p className="small muted" style={{ margin: 0 }}>{d.remarks}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      {tab === "discipline" && <div className="stack">{recordCard("discipline")}{recordCard("award")}</div>}

      {tab === "training" && (
        <div className="stack">
          <Card title={`Training status ${year}`} actions={<select className="input input-sm" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2, 3].map((d) => <option key={d}>{currentYear() - d}</option>)}</select>}>
            {trainingTypes.filter((t) => t.active).map((t) => {
              const recs = data.training.filter((r) => r.year === year);
              const st = trainingStatus(t, s, recs);
              const mine = recs.filter((r) => r.training_type_id === t.id).sort((a, b) => a.sequence_no - b.sequence_no || a.attempt_no - b.attempt_no);
              return (
                <div key={t.id} className="kv" style={{ alignItems: "flex-start" }}>
                  <div><strong>{t.name}</strong><div className="small muted">{mine.map((r) => `${seqName(t, r.sequence_no)}${r.attempt_no > 1 ? ` (att ${r.attempt_no})` : ""}: ${resultLabel(t, r.result)}${r.marks !== null ? ` ${r.marks}` : ""} · ${fmtDate(r.test_date)}`).join("  |  ") || "No record"}</div></div>
                  <span className="row nowrap"><span className="mono">{st.done}/{st.required}</span><Badge tone={isCompletionType(t) && st.state === "Not Started" ? "red" : TRAINING_STATE_TONE[st.state]}>{isCompletionType(t) ? resultLabel(t, st.state) : st.state === "Not Started" ? "Yet to appear" : st.state}{st.reason ? ` · ${st.reason}` : ""}</Badge></span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {tab === "leave" && (
        <div className="stack">
          <Card title={`Leave balance ${currentYear()}`} pad={false}>
            <div className="table-wrap"><table className="table compact">
              <thead><tr><th>Type</th><th className="num">Entitled</th><th className="num">Availed</th><th className="num">Pending</th><th className="num">Balance</th></tr></thead>
              <tbody>{leaveBalance(data.leave, leaveTypes, currentYear()).map((b) => <tr key={b.type.id}><td>{b.type.name}</td><td className="num">{b.quota ?? "—"}</td><td className="num">{b.used}</td><td className="num">{b.pending || ""}</td><td className="num strong">{b.remaining ?? "—"}</td></tr>)}</tbody>
            </table></div>
          </Card>
          <Card title="Leave history" pad={false}>
            {data.leave.length === 0 ? <Empty>No leave records</Empty> : (
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>Type</th><th>From</th><th>To</th><th className="num">Days</th><th>Status</th><th>Rejoined</th><th>Reason</th></tr></thead>
                <tbody>{data.leave.map((l) => <tr key={l.id}><td>{leaveTypes.find((t) => t.id === l.leave_type_id)?.code}</td><td>{fmtDate(l.from_date)}</td><td>{fmtDate(l.to_date)}</td><td className="num">{l.days}</td><td><Badge tone={LEAVE_STATUS_TONE[l.status]}>{l.status}</Badge></td><td>{fmtDate(l.rejoin_date)}</td><td className="small">{l.reason}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}

      {tab === "medical" && (
        <div className="stack">
          <Card title="Medical status"><dl className="dl"><div><dt>Medical category</dt><dd>{s.medical_category ?? "—"}</dd></div><div><dt>Remarks</dt><dd>{s.medical_remarks ?? "—"}</dd></div><div><dt>Blood group</dt><dd>{s.blood_group ?? "—"}</dd></div><div><dt>Height / Weight</dt><dd>{heightLabel(s.height_in)} / {s.weight_lbs ? `${s.weight_lbs} lbs` : "—"}</dd></div></dl></Card>
          {recordCard("medical")}
          <Card title="Sick reports" pad={false}>
            {data.sick.length === 0 ? <Empty>No sick reports</Empty> : (
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>Date</th><th>Complaint</th><th>Disposal</th><th className="num">Days</th><th>Hospital</th><th>Discharged</th></tr></thead>
                <tbody>{data.sick.map((r) => <tr key={r.id}><td>{fmtDate(r.report_date)}</td><td>{r.complaint}</td><td><Badge tone={r.disposal === "Admitted" ? "red" : r.disposal === "Duty" ? "green" : "amber"}>{r.disposal}</Badge></td><td className="num">{r.days}</td><td>{r.hospital ?? "—"}</td><td>{fmtDate(r.discharge_date)}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}

      {tab === "requests" && (
        <div className="stack">
          <Card title="Profile change requests" pad={false}>
            {data.reqs.length === 0 ? <Empty>No requests</Empty> : <RequestList reqs={data.reqs} self={self} onCancel={async (id) => { await run(async () => { await cancelChangeRequest(id); reload(); }, "Request cancelled"); }} />}
          </Card>
          {!self && perms.canEditSettings && (
            <Card title="Audit trail" pad={false}>
              {data.audit.length === 0 ? <Empty>No logged changes</Empty> : (
                <div className="table-wrap"><table className="table compact">
                  <thead><tr><th>When</th><th>By</th><th>Action</th><th>Changes</th></tr></thead>
                  <tbody>{data.audit.map((a) => (
                    <tr key={a.id}><td className="nowrap">{fmtDateTime(a.at)}</td><td>{data.people.find((p) => p.id === a.actor)?.full_name ?? "System"}</td><td>{a.action}</td>
                      <td className="small">{a.action === "UPDATE" ? Object.entries(a.changes).map(([k, v]) => `${fieldLabel(k)}: ${String((v as { from: unknown }).from ?? "—")} → ${String((v as { to: unknown }).to ?? "—")}`).join("; ") : a.action === "INSERT" ? "Record created" : "Deleted"}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </Card>
          )}
        </div>
      )}

      {recordModal && (
        <FormModal open title={`${recordModal.request ? "Request: " : ""}${recordModal.rec ? "Edit" : "Add"} ${RECORD_KINDS[recordModal.kind].title.toLowerCase()}`}
          fields={RECORD_KINDS[recordModal.kind].fields} initial={recordModal.rec?.data ?? {}} busy={busy}
          saveLabel={recordModal.request ? "Send for approval" : "Save"}
          note={recordModal.request ? "Your Coy Comd will verify this before it is added to your file." : undefined}
          onClose={() => setRecordModal(null)} onSave={(v) => saveRec(recordModal.kind, v, recordModal.rec, recordModal.request)} />
      )}
      {removeOpen && <RemoveModal soldier={s} onClose={() => setRemoveOpen(false)} onDone={() => { setRemoveOpen(false); reload(); }} />}
      {editRequest && <SelfEditModal soldier={s} onClose={() => setEditRequest(false)} onDone={() => { setEditRequest(false); reload(); }} />}
    </div>
  );
}

function displayValue(f: FieldDef, s: Soldier, companyById: Map<string, { name: string }>) {
  const v = (s as unknown as Record<string, unknown>)[f.key];
  if (v === null || v === undefined || v === "") return "—";
  if (f.key === "company_id") return companyById.get(String(v))?.name ?? "—";
  if (f.type === "date") return fmtDate(String(v));
  if (f.key === "height_in") return `${heightLabel(Number(v))} (${v} in)`;
  return String(v);
}

export function RequestList({ reqs, self, onCancel }: { reqs: ProfileChangeRequest[]; self?: boolean; onCancel?: (id: string) => void }) {
  return (
    <div className="table-wrap"><table className="table compact">
      <thead><tr><th>Date</th><th>Requested changes</th><th>Status</th><th>Remarks</th><th /></tr></thead>
      <tbody>{reqs.map((r) => (
        <tr key={r.id}>
          <td className="nowrap">{fmtDateTime(r.created_at)}</td>
          <td className="small"><ChangeSummary r={r} /></td>
          <td><Badge tone={r.status === "Approved" ? "green" : r.status === "Rejected" ? "red" : r.status === "Pending" ? "amber" : "grey"}>{r.status}</Badge></td>
          <td className="small">{r.review_remarks ?? r.note ?? ""}</td>
          <td>{self && r.status === "Pending" && onCancel && <button className="btn btn-xs" onClick={() => onCancel(r.id)}><X size={12} /> Cancel</button>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function ChangeSummary({ r }: { r: ProfileChangeRequest }) {
  const { companyById } = useSession();
  const show = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "—" : k === "company_id" ? companyById.get(String(v))?.name ?? String(v) : String(v));
  return (
    <div className="stack" style={{ gap: 3 }}>
      {Object.entries(r.changes).map(([k, v]) => (
        <div key={k}><strong>{fieldLabel(k)}:</strong> <span className="diff-old">{show(k, r.old_values[k])}</span> → <span className="diff-new">{show(k, v)}</span></div>
      ))}
      {r.record_ops.map((op, i) => (
        <div key={i}><strong>{op.op === "add" ? "Add" : op.op === "update" ? "Update" : "Remove"} {RECORD_KINDS[op.kind]?.title.toLowerCase().replace(/s$/, "")}:</strong> {op.data ? Object.values(op.data).filter(Boolean).join(", ") : ""}</div>
      ))}
    </div>
  );
}

function SelfEditModal({ soldier, onClose, onDone }: { soldier: Soldier; onClose: () => void; onDone: () => void }) {
  const { settings, companies } = useSession();
  const { t } = useI18n();
  const raw = soldier as unknown as Record<string, unknown>;
  const editable = new Set<string>(REQUESTABLE_FIELDS);
  const groups = SOLDIER_FIELD_GROUPS.map((g) => ({ title: g.title, fields: g.fields.filter((f) => editable.has(f.key)) })).filter((g) => g.fields.length);
  const fields = groups.flatMap((g) => g.fields);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(raw[f.key] ?? "")])));
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const changed = fields.filter((f) => (v[f.key] ?? "") !== String(raw[f.key] ?? ""));

  async function submit() {
    const changes: Record<string, string | null> = {};
    const old: Record<string, string | null> = {};
    for (const f of changed) {
      changes[f.key] = v[f.key] || null;
      old[f.key] = raw[f.key] === null || raw[f.key] === undefined ? null : String(raw[f.key]);
    }
    if (changes.home_district !== undefined) {
      changes.home_division = divisionOf(changes.home_district);
      old.home_division = soldier.home_division;
    }
    await run(async () => {
      await createChangeRequest({ soldier_id: soldier.id, changes, old_values: old, record_ops: [], note: note || null });
      onDone();
    }, "Sent for approval");
  }
  const optionsFor = (f: FieldDef) =>
    f.type === "rank" ? settings.ranks[(v.category || soldier.category) as keyof typeof settings.ranks] ?? []
      : f.type === "trade" ? [...new Set([...settings.trades, ...(v.trade ? [v.trade] : [])])]
      : f.type === "district" ? ALL_DISTRICTS : undefined;
  const coyOptions = companies.filter((c) => c.active || c.id === soldier.company_id).map((c) => ({ value: c.id, label: c.name }));

  return (
    <FormShell title="Request changes to my profile" onClose={onClose} busy={busy} disabled={!changed.length} onSave={submit} saveLabel={`Send ${changed.length || ""} change(s) for approval`}>
      <p className="muted small" style={{ marginTop: 0 }}>{t("Change any field below. Changed fields are highlighted; your Coy Comd verifies them before they are written to your file.")}</p>
      {groups.map((g) => (
        <div className="form-section" key={g.title}>
          <h3>{t(g.title)}</h3>
          <div className="form-grid">
            {g.fields.map((f) => (
              <label className="field" key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                <span className="field-label" style={changed.includes(f) ? { color: "var(--amber)" } : undefined}>{t(f.label)}{changed.includes(f) ? ` • ${t("changed")}` : ""}</span>
                <FieldInput def={f.type === "rank" || f.type === "trade" || f.type === "district" ? { ...f, type: "select", options: optionsFor(f) } : f} options={f.type === "company" ? coyOptions : undefined} value={v[f.key] ?? ""}
                  onChange={(x) => setV((cur) => ({ ...cur, [f.key]: x, ...(f.key === "category" ? { rank: "" } : {}) }))} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <label className="field field-wide"><span className="field-label">{t("Note for the approver (optional)")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new mobile number, moved to family quarter" /></label>
    </FormShell>
  );
}

function FormShell({ title, children, onClose, onSave, busy, disabled, saveLabel }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; busy: boolean; disabled?: boolean; saveLabel: string }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || disabled} onClick={onSave}>{saveLabel}</button></div>
      </div>
    </div>
  );
}

function RemoveModal({ soldier, onClose, onDone }: { soldier: Soldier; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState("Transferred Out");
  const [date, setDate] = useState(bdToday());
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  return (
    <FormShell title={`Remove ${soldier.rank} ${soldier.name} from the coy`} onClose={onClose} busy={busy} saveLabel="Remove"
      onSave={() => run(async () => {
        await saveSoldier({ id: soldier.id, status, remarks: [soldier.remarks, `${status} on ${date}${note ? ` — ${note}` : ""}`].filter(Boolean).join("\n") });
        onDone();
      }, "Removed — he no longer appears in the parade state")}>
      <div className="form-grid">
        <label className="field"><span className="field-label">Reason</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{["Transferred Out", "Retired", "Discharged", "Deceased", "Deserted"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span className="field-label">Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field field-wide"><span className="field-label">Remarks (posting order, new unit…)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <p className="small muted">His full record is kept for history. Change the status back to Serving to restore him.</p>
    </FormShell>
  );
}
