"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileText, LogOut as Discharge, Plus, Trash2 } from "lucide-react";
import { exportObjectsPdf } from "@/lib/pdf";
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, SoldierPicker, Stat, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { restoreRow, deleteSickReport, listOpenAdmissions, listSickReports, saveSickReport } from "@/lib/api";
import { exportXlsx } from "@/lib/excel";
import { useSession } from "@/lib/session";
import type { SickReport } from "@/lib/types";
import { addDays, bdToday, diffDays, fmtDate, soldierLabel, fmtDateFull } from "@/lib/utils";

const DISPOSALS = ["Duty", "Light Duty", "Excused Duty", "Admitted", "Referred"];
const TONE: Record<string, string> = { Duty: "green", "Light Duty": "amber", "Excused Duty": "amber", Admitted: "red", Referred: "blue" };

export default function MedicalPage() {
  const { perms, directoryById, companyById, settings } = useSession();
  const today = bdToday();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [edit, setEdit] = useState<Partial<SickReport> | null>(null);
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const { data, error, loading, reload } = useAsync(async () => {
    const [list, admitted] = await Promise.all([listSickReports({ from, to }), listOpenAdmissions()]);
    return { list: list.filter((r) => perms.canViewCompany(r.company_id)), admitted: admitted.filter((r) => perms.canViewCompany(r.company_id)) };
  }, [from, to]);

  const todays = useMemo(() => (data?.list ?? []).filter((r) => r.report_date === today), [data, today]);
  const ed = useMemo(() => (data?.list ?? []).filter((r) => ["Excused Duty", "Light Duty"].includes(r.disposal) && addDays(r.report_date, Math.max(r.days, 1) - 1) >= today), [data, today]);

  const sickRows = () => (data?.list ?? []).map((r, i) => { const s = directoryById.get(r.soldier_id); return { Ser: i + 1, Date: r.report_date, "Personal No": s?.snk_no ?? "", Rank: s?.rank ?? "", Name: s?.name ?? "", Coy: companyById.get(r.company_id ?? "")?.short_name ?? "", Complaint: r.complaint ?? "", Disposal: r.disposal, Days: r.days, Hospital: r.hospital ?? "", Discharged: r.discharge_date ?? "" }; });

  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Sick Report / MI Room"
        actions={<>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          <button className="btn" onClick={() => exportXlsx(`Sick_Report_${from}_${to}`, [{ name: "Sick report", rows: sickRows() }])}><Download size={15} /> Excel</button>
          <button className="btn" disabled={!data?.list.length} onClick={() => exportObjectsPdf({ filename: `Sick_Report_${from}_${to}`, unit: settings.unit.name, title: "Sick Report / MI Room", subtitle: `${fmtDateFull(from)} to ${fmtDateFull(to)}`, orientation: "landscape", chips: [{ label: "Reports", value: String(data?.list.length ?? 0), color: "#d6455d" }], rows: sickRows().map((r) => ({ ...r, Date: fmtDateFull(r.Date), Discharged: r.Discharged ? fmtDateFull(r.Discharged) : "" })) })}><FileText size={15} /> PDF</button>
          {perms.canEditAnyCompany && <button className="btn btn-primary" onClick={() => setEdit({ report_date: today, disposal: "Duty", days: 1 })}><Plus size={15} /> Report sick</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="stats">
            <Stat label="Reported sick today" value={todays.length} tone="navy" />
            <Stat label="In hospital" value={data.admitted.length} tone="red" />
            <Stat label="Excused / light duty" value={ed.length} tone="amber" />
            <Stat label="Reports in period" value={data.list.length} />
          </div>
          {data.admitted.length > 0 && (
            <Card title="In hospital now" className="mb" pad={false}>
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>Soldier</th><th>Hospital</th><th>Admitted</th><th className="num">Days</th><th>Complaint</th><th /></tr></thead>
                <tbody>{data.admitted.map((r) => (
                  <tr key={r.id}><td><Link className="link" href={`/soldiers/view?id=${r.soldier_id}`}>{soldierLabel(directoryById.get(r.soldier_id))}</Link></td><td>{r.hospital}</td><td>{fmtDate(r.report_date)}</td><td className="num">{diffDays(today, r.report_date)}</td><td>{r.complaint}</td>
                    <td className="right">{perms.canEditCompany(r.company_id) && <button className="btn btn-xs" disabled={busy} onClick={() => { const d = window.prompt("Discharge date (YYYY-MM-DD):", today); if (d) void run(async () => { await saveSickReport({ id: r.id, discharge_date: d }); reload(); }, "Discharge recorded"); }}><Discharge size={12} /> Discharged</button>}</td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          )}
          <Card title="Sick reports" pad={false}>
            {data.list.length === 0 ? <Empty>No sick reports in this period.</Empty> : (
              <div className="table-wrap tall"><table className="table">
                <thead><tr><th>Date</th><th>Soldier</th><th>Complaint</th><th>Disposal</th><th className="num">Days</th><th>Hospital</th><th>Remarks</th><th /></tr></thead>
                <tbody>{data.list.map((r) => {
                  const s = directoryById.get(r.soldier_id);
                  return (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDate(r.report_date)}</td>
                      <td><div className="who"><Link className="link" href={`/soldiers/view?id=${r.soldier_id}`}>{s?.rank} {s?.name}</Link><span>{s?.snk_no} · {companyById.get(r.company_id ?? "")?.short_name}</span></div></td>
                      <td>{r.complaint}</td><td><Badge tone={TONE[r.disposal]}>{r.disposal}</Badge></td><td className="num">{r.days}</td><td>{r.hospital}{r.discharge_date && <div className="small muted">disch {fmtDate(r.discharge_date)}</div>}</td><td className="small">{r.remarks}</td>
                      <td className="nowrap">{perms.canEditCompany(r.company_id) && <><button className="btn btn-xs btn-ghost" onClick={() => setEdit(r)}>Edit</button><button className="btn btn-xs btn-ghost" onClick={() => undoable({ text: "Sick report deleted", act: () => deleteSickReport(r.id), undo: () => restoreRow("sick_reports", r), after: reload })}><Trash2 size={12} /></button></>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit sick report" : "Report sick"}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !edit?.soldier_id} onClick={() => run(async () => { await saveSickReport({ ...edit!, hospital: edit!.hospital || null, discharge_date: edit!.discharge_date || null }); setEdit(null); reload(); }, "Saved")}>Save</button></>}>
        {edit && <div className="form-grid">
          <Field label="Soldier" wide required>{edit.id ? <input className="input" disabled value={soldierLabel(directoryById.get(edit.soldier_id!))} /> : <SoldierPicker value={edit.soldier_id ?? null} onChange={(id) => setEdit({ ...edit, soldier_id: id ?? undefined })} filter={(s) => perms.canEditCompany(s.company_id)} autoFocus />}</Field>
          <Field label="Date"><input className="input" type="date" value={edit.report_date ?? today} onChange={(e) => setEdit({ ...edit, report_date: e.target.value })} /></Field>
          <Field label="Disposal (MO's decision)"><Select value={edit.disposal} onChange={(v) => setEdit({ ...edit, disposal: v as SickReport["disposal"] })} options={DISPOSALS} /></Field>
          <Field label="Complaint / diagnosis" wide><input className="input" value={edit.complaint ?? ""} onChange={(e) => setEdit({ ...edit, complaint: e.target.value })} /></Field>
          {["Excused Duty", "Light Duty"].includes(edit.disposal ?? "") && <Field label="Days"><input className="input" type="number" min={1} value={edit.days ?? 1} onChange={(e) => setEdit({ ...edit, days: Number(e.target.value) })} /></Field>}
          {["Admitted", "Referred"].includes(edit.disposal ?? "") && <Field label="Hospital"><input className="input" value={edit.hospital ?? ""} onChange={(e) => setEdit({ ...edit, hospital: e.target.value })} placeholder="CMH …" /></Field>}
          {edit.disposal === "Admitted" && <Field label="Discharge date" hint="Leave blank while still admitted"><input className="input" type="date" value={edit.discharge_date ?? ""} onChange={(e) => setEdit({ ...edit, discharge_date: e.target.value })} /></Field>}
          <Field label="Remarks" wide><input className="input" value={edit.remarks ?? ""} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
