"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Printer, Trash2 } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { restoreRow, copyProgrammes, deleteProgramme, listProgrammes, saveProgramme } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { DailyProgramme } from "@/lib/types";
import { addDays, bdToday, fmtDate, fmtDateLong, fmtTime, isWeekend } from "@/lib/utils";

const STATUSES = ["Planned", "Ongoing", "Completed", "Cancelled"];

export default function DailyProgrammePage() {
  const { perms, myCompanies, companyById, settings, profile } = useSession();
  const today = bdToday();
  const [date, setDate] = useState(today);
  const [edit, setEdit] = useState<Partial<DailyProgramme> | null>(null);
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const { data, error, loading, reload } = useAsync(() => listProgrammes(date, date), [date]);

  const canEdit = (p: Partial<DailyProgramme>) => perms.isSuper || perms.isClerk || (!!p.company_id && perms.canPlanCompany(p.company_id));
  const canAdd = perms.isSuper || perms.isCoyComd || perms.isClerk;
  const rows = [...(data ?? [])].sort((a, b) => String(a.time_from).localeCompare(String(b.time_from)));

  return (
    <div className="page">
      <PageHeader eyebrow="Daily Activities" title="Daily Programme" subtitle={<>{fmtDateLong(date)}{isWeekend(date) && <> <Badge tone="red">Weekly holiday</Badge></>}</>}
        actions={<>
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today)} style={{ width: 160 }} />
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
          {date !== today && <button className="btn btn-sm" onClick={() => setDate(today)}>Today</button>}
          <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
          {canAdd && <button className="btn" disabled={busy} onClick={() => confirm(`Copy all programme items from ${fmtDate(addDays(date, -1))} to ${fmtDate(date)}?`) && run(async () => { const n = await copyProgrammes(addDays(date, -1), date); reload(); return n; }, "Copied from previous day")}><Copy size={15} /> Copy previous day</button>}
          {canAdd && <button className="btn btn-primary" onClick={() => setEdit({ date, status: "Planned", company_id: perms.canEditUnitActivities ? null : profile.company_id })}><Plus size={15} /> Add item</button>}
        </>} />
      <div className="print-only report-title"><h2>{settings.unit.name} — Daily Programme</h2><p>{fmtDateLong(date)}</p></div>
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No programme published for this day.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Time</th><th>Activity</th><th>Venue</th><th>Participants</th><th>Dress</th><th>Responsible</th><th>Status</th><th className="no-print" /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className={p.status === "Cancelled" ? "row-muted" : undefined}>
                <td className="nowrap"><span className="time-pill">{fmtTime(p.time_from)}{p.time_to ? `–${fmtTime(p.time_to)}` : ""}</span></td>
                <td><strong>{p.activity}</strong>{p.company_id && <> <Badge tone="blue">{companyById.get(p.company_id)?.short_name}</Badge></>}{p.remarks && <div className="small muted">{p.remarks}</div>}</td>
                <td>{p.venue}</td><td>{p.participants}</td><td>{p.dress}</td><td>{p.responsible}</td>
                <td><Badge tone={p.status === "Completed" ? "green" : p.status === "Ongoing" ? "blue" : p.status === "Cancelled" ? "grey" : "amber"}>{p.status}</Badge></td>
                <td className="no-print nowrap">{canEdit(p) && <><button className="btn btn-xs btn-ghost" onClick={() => setEdit(p)}>Edit</button><button className="btn btn-xs btn-ghost" onClick={() => undoable({ text: "Programme item deleted", act: () => deleteProgramme(p.id), undo: () => restoreRow("daily_programmes", p), after: reload })}><Trash2 size={12} /></button></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit programme item" : "Add programme item"}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !edit?.activity} onClick={() => run(async () => { await saveProgramme({ ...edit!, company_id: edit!.company_id || null, time_from: edit!.time_from || null, time_to: edit!.time_to || null }); setEdit(null); reload(); }, "Saved")}>Save</button></>}>
        {edit && <div className="form-grid">
          <Field label="Activity" wide required><input className="input" value={edit.activity ?? ""} onChange={(e) => setEdit({ ...edit, activity: e.target.value })} /></Field>
          <Field label="Date"><input className="input" type="date" value={edit.date ?? date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
          <Field label="For"><Select value={edit.company_id ?? ""} onChange={(v) => setEdit({ ...edit, company_id: v || null })} placeholder={perms.canEditUnitActivities ? "Whole unit" : undefined} options={myCompanies.filter((c) => perms.canPlanCompany(c.id)).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="From"><input className="input" type="time" value={fmtTime(edit.time_from)} onChange={(e) => setEdit({ ...edit, time_from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="time" value={fmtTime(edit.time_to)} onChange={(e) => setEdit({ ...edit, time_to: e.target.value })} /></Field>
          <Field label="Venue"><input className="input" value={edit.venue ?? ""} onChange={(e) => setEdit({ ...edit, venue: e.target.value })} /></Field>
          <Field label="Participants"><input className="input" value={edit.participants ?? ""} onChange={(e) => setEdit({ ...edit, participants: e.target.value })} placeholder="All ranks, JCOs & NCOs…" /></Field>
          <Field label="Dress"><input className="input" value={edit.dress ?? ""} onChange={(e) => setEdit({ ...edit, dress: e.target.value })} /></Field>
          <Field label="Responsible"><input className="input" value={edit.responsible ?? ""} onChange={(e) => setEdit({ ...edit, responsible: e.target.value })} /></Field>
          <Field label="Status"><Select value={edit.status} onChange={(v) => setEdit({ ...edit, status: v as DailyProgramme["status"] })} options={STATUSES} /></Field>
          <Field label="Remarks" wide><input className="input" value={edit.remarks ?? ""} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
