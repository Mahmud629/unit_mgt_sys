"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, useAction, useAsync, useUndo } from "@/components/ui";
import { restoreRow, deleteTrainingEvent, listTrainingEvents, saveTrainingEvent } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { TrainingEvent } from "@/lib/types";
import { addDays, bdToday, cls, fmtDate, WEEKDAYS, isWeekend, weekStart } from "@/lib/utils";

const EVENT_TYPES = ["Training", "Test", "Cadre", "Exercise", "Range", "Lecture", "Sports", "Inspection", "Other"];
const STATUSES = ["Planned", "Ongoing", "Completed", "Cancelled"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function TrainingCalendarPage() {
  const { perms, myCompanies, companyById, trainingTypes, profile } = useSession();
  const today = bdToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [edit, setEdit] = useState<Partial<TrainingEvent> | null>(null);
  const [view, setView] = useState<"month" | "list">("month");
  const { busy, run } = useAction();
  const undoable = useUndo();

  const first = `${month}-01`;
  const startGrid = weekStart(first); // the week starts on Sunday
  const days = Array.from({ length: 42 }, (_, i) => addDays(startGrid, i));
  const { data, error, loading, reload } = useAsync(() => listTrainingEvents(view === "month" ? startGrid : addDays(today, -30), view === "month" ? days[41] : addDays(today, 365)), [month, view]);

  const canEdit = (e: Partial<TrainingEvent>) => perms.isSuper || perms.isClerk || (!!e.company_id && perms.canPlanCompany(e.company_id));
  const canAdd = perms.isSuper || perms.isCoyComd || perms.isClerk;
  // month view: per week, each event is one bar on a lane (multi-day events are not repeated per day)
  const MAX_LANES = 4;
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, wi) => {
    const wd = days.slice(wi * 7, wi * 7 + 7);
    const evs = (data ?? []).filter((e) => e.start_date <= wd[6] && e.end_date >= wd[0])
      .map((e) => ({ e, s: Math.max(0, wd.indexOf(e.start_date < wd[0] ? wd[0] : e.start_date)), t: e.end_date > wd[6] ? 6 : wd.indexOf(e.end_date), contL: e.start_date < wd[0], contR: e.end_date > wd[6] }))
      .sort((a, b) => a.s - b.s || b.t - b.s - (a.t - a.s));
    const lanes: (typeof evs)[] = [];
    const more = wd.map(() => 0);
    for (const b of evs) {
      let lane = lanes.find((l) => l.every((x) => x.t < b.s || x.s > b.t));
      if (!lane && lanes.length < MAX_LANES) lanes.push((lane = []));
      if (lane) lane.push(b);
      else for (let k = b.s; k <= b.t; k++) more[k]++;
    }
    return { days: wd, lanes, more };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, month]);
  const shift = (n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };

  async function save() {
    if (!edit) return;
    await run(async () => { await saveTrainingEvent({ ...edit, end_date: edit.end_date || edit.start_date, company_id: edit.company_id || null, training_type_id: edit.training_type_id || null }); setEdit(null); reload(); }, "Saved");
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Training Calendar"
        actions={<>
          <div className="seg"><button className={cls(view === "month" && "on")} onClick={() => setView("month")}>Month</button><button className={cls(view === "list" && "on")} onClick={() => setView("list")}>Upcoming</button></div>
          {canAdd && <button className="btn btn-primary" onClick={() => setEdit({ start_date: today, end_date: today, event_type: "Training", status: "Planned", company_id: perms.canEditUnitActivities ? null : profile.company_id })}><Plus size={15} /> Add event</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {view === "month" ? (
        <Card title={<><button className="icon-btn" onClick={() => shift(-1)}><ChevronLeft size={16} /></button> {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)} <button className="icon-btn" onClick={() => shift(1)}><ChevronRight size={16} /></button></>}
          actions={<button className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>} pad={false}>
          {loading && !data ? <Loading /> : (
            <>
              <div className="cal">
                {WEEKDAYS.map((d) => <div className={cls("cal-head", (d === "Fri" || d === "Sat") && "holiday")} key={d}>{d}</div>)}
              </div>
              <div className="cal-weeks">
                {weeks.map((w) => (
                  <div key={w.days[0]} className="cal-week" style={{ ["--lanes" as string]: w.lanes.length }}>
                    {w.days.map((d, ci) => (
                      <div key={d} className={cls("cal-day", d.slice(0, 7) !== month && "other", d === today && "today", isWeekend(d) && "holiday")} style={{ gridColumn: ci + 1 }}>
                        <span className="cal-num">{Number(d.slice(8))}</span>
                        {w.more[ci] > 0 && <button className="cal-more" onClick={() => setView("list")} title="Show the list">+{w.more[ci]} more</button>}
                      </div>
                    ))}
                    {/* one bar from the first to the last day of each event (continues into the next week) */}
                    {w.lanes.flatMap((lane, li) => lane.map((b) => (
                      <button key={`${b.e.id}-${li}`} className={cls("cal-bar", `t-${b.e.event_type}`, b.contL && "cont-l", b.contR && "cont-r", b.e.status === "Cancelled" && "cancelled")}
                        style={{ gridColumn: `${b.s + 1} / ${b.t + 2}`, gridRow: li + 2 }}
                        title={`${b.e.title} · ${fmtDate(b.e.start_date)}${b.e.end_date !== b.e.start_date ? ` – ${fmtDate(b.e.end_date)}` : ""}${b.e.venue ? " · " + b.e.venue : ""}`}
                        onClick={() => setEdit(b.e)}>
                        <strong>{b.e.title}</strong>
                        {b.t > b.s && <span>{fmtDate(b.e.start_date, false)} – {fmtDate(b.e.end_date, false)}</span>}
                      </button>
                    )))}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card pad={false}>
          {loading && !data ? <Loading /> : !data?.length ? <Empty>No events.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Dates</th><th>Event</th><th>Type</th><th>For</th><th>Venue</th><th>Conducting</th><th>Status</th></tr></thead>
              <tbody>{data.filter((e) => e.end_date >= today).map((e) => (
                <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setEdit(e)}>
                  <td className="nowrap">{fmtDate(e.start_date)}{e.end_date !== e.start_date && ` – ${fmtDate(e.end_date)}`}</td><td className="strong">{e.title}</td><td>{e.event_type}</td>
                  <td>{e.company_id ? companyById.get(e.company_id)?.short_name : "Unit"}</td><td>{e.venue}</td><td>{e.conducting_officer}</td>
                  <td><Badge tone={e.status === "Completed" ? "green" : e.status === "Ongoing" ? "blue" : e.status === "Cancelled" ? "grey" : "amber"}>{e.status}</Badge></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? (canEdit(edit) ? "Edit event" : edit.title ?? "Event") : "Add training event"}
        footer={edit && canEdit(edit) ? <>
          {edit.id && <button className="btn btn-red" style={{ marginRight: "auto" }} onClick={() => { const full = data?.find((x) => x.id === edit.id) ?? edit; setEdit(null); void undoable({ text: "Event deleted", act: () => deleteTrainingEvent(edit.id!), undo: () => restoreRow("training_events", full), after: reload }); }}><Trash2 size={14} /></button>}
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !edit.title || !edit.start_date} onClick={save}>Save</button>
        </> : <button className="btn" onClick={() => setEdit(null)}>Close</button>}>
        {edit && (canEdit(edit) ? (
          <div className="form-grid">
            <Field label="Title" wide required><input className="input" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Type"><Select value={edit.event_type} onChange={(v) => setEdit({ ...edit, event_type: v })} options={EVENT_TYPES} /></Field>
            <Field label="Linked test" hint="Optional: IPFT, RET…"><Select value={edit.training_type_id ?? ""} onChange={(v) => setEdit({ ...edit, training_type_id: v || null })} placeholder="—" options={trainingTypes.map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="From" required><input className="input" type="date" value={edit.start_date ?? ""} onChange={(e) => setEdit({ ...edit, start_date: e.target.value, end_date: !edit.end_date || edit.end_date < e.target.value ? e.target.value : edit.end_date })} /></Field>
            <Field label="To"><input className="input" type="date" value={edit.end_date ?? ""} min={edit.start_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} /></Field>
            <Field label="For"><Select value={edit.company_id ?? ""} onChange={(v) => setEdit({ ...edit, company_id: v || null })} placeholder={perms.canEditUnitActivities ? "Whole unit" : undefined} options={myCompanies.filter((c) => perms.canPlanCompany(c.id)).map((c) => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={(v) => setEdit({ ...edit, status: v as TrainingEvent["status"] })} options={STATUSES} /></Field>
            <Field label="Venue"><input className="input" value={edit.venue ?? ""} onChange={(e) => setEdit({ ...edit, venue: e.target.value })} /></Field>
            <Field label="Conducting officer"><input className="input" value={edit.conducting_officer ?? ""} onChange={(e) => setEdit({ ...edit, conducting_officer: e.target.value })} /></Field>
            <Field label="Details" wide><textarea className="input" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
        ) : (
          <div>
            {[["Type", edit.event_type], ["Dates", `${fmtDate(edit.start_date)} – ${fmtDate(edit.end_date)}`], ["For", edit.company_id ? companyById.get(edit.company_id)?.name : "Whole unit"], ["Venue", edit.venue], ["Conducting", edit.conducting_officer], ["Status", edit.status], ["Details", edit.description]].map(([k, v]) => <div className="kv" key={k as string}><span className="muted">{k}</span><span>{v || "—"}</span></div>)}
          </div>
        ))}
      </Modal>
    </div>
  );
}
