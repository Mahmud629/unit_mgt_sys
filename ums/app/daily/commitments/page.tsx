"use client";

import { Fragment, useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, useAction, useAsync, useUndo } from "@/components/ui";
import { deleteCommitment, listCommitments, listCourses, listDuties, listLeave, restoreRow, saveCommitment } from "@/lib/api";
import { isOnLeave } from "@/lib/compute";
import { useI18n } from "@/lib/i18n";
import { exportReportPdf, type PdfCell } from "@/lib/pdf";
import { useSession } from "@/lib/session";
import type { DirectoryEntry, OfficerCommitment } from "@/lib/types";
import { WEEKDAYS, addDays, bdToday, cls, fmtDate, fmtDateLong, fmtTime, isWeekend, weekStart, weekday } from "@/lib/utils";

type Item = { key: string; kind: "own" | "duty" | "leave" | "course"; time: string; title: string; venue?: string | null; row?: OfficerCommitment;
  /** same group on consecutive days = one continuous entry (v3.5) */
  group: string; from?: string | null; to?: string | null; spanTitle?: string };
/** A continuous entry drawn as one bar from its first to its last day of the week. */
type Span = { item: Item; i: number; j: number; rows: OfficerCommitment[] };
const KIND_COLOR: Record<Item["kind"], string> = { own: "#1c3d57", duty: "#6d4fb3", leave: "#2c9fb9", course: "#b36a1d" };
const KIND_LABEL: Record<Item["kind"], string> = { own: "Commitment", duty: "Duty", leave: "Leave", course: "Course" };

/** CO's and all officers' commitments — a week board for the Adjt. */
export default function CommitmentsPage() {
  const { perms, profile, directory, settings, leaveTypes } = useSession();
  const { t } = useI18n();
  const today = bdToday();
  const [start, setStart] = useState(weekStart(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [edit, setEdit] = useState<Partial<OfficerCommitment> | null>(null);
  const [only, setOnly] = useState("");
  const { run } = useAction();
  const undoable = useUndo();

  const { data, error, loading, reload } = useAsync(async () => {
    const [own, duties, leave, courses] = await Promise.all([
      listCommitments(days[0], days[6]), listDuties(days[0], days[6]), listLeave({ from: addDays(days[0], -90), to: days[6] }), listCourses(),
    ]);
    return { own, duties, leave, courses };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const rankIdx = (d: DirectoryEntry) => { const i = (settings.ranks.Offr ?? []).indexOf(d.rank); return i < 0 ? 99 : i; };
  const officers = useMemo(() => directory.filter((d) => d.category === "Offr" && d.status === "Serving").sort((a, b) => rankIdx(a) - rankIdx(b) || a.display_order - b.display_order), // eslint-disable-line react-hooks/exhaustive-deps
    [directory, settings]);
  const co = officers[0];
  // the Adjt (2IC / CO) keeps the whole board; an officer adds or changes his own commitments
  const mine = [profile.soldier_id, profile.held_by_soldier].filter(Boolean) as string[];
  const canEditOf = (sid: string) => perms.isSuper || mine.includes(sid);
  const leaveName = (id: string) => leaveTypes.find((x) => x.id === id)?.code ?? "Leave";
  const leaveFull = (id: string) => { const lt = leaveTypes.find((x) => x.id === id); return lt ? `${lt.code} · ${lt.name}` : "Leave"; };

  const itemsFor = (sid: string, date: string): Item[] => {
    if (!data) return [];
    const out: Item[] = [
      ...data.own.filter((c) => c.soldier_id === sid && c.date === date).map((c) => { const time = c.time_from ? `${fmtTime(c.time_from)}${c.time_to ? `–${fmtTime(c.time_to)}` : ""}` : ""; return { key: c.id, kind: "own" as const, time, title: c.title, venue: c.venue, row: c, group: `own|${c.title.trim().toLowerCase()}|${time}|${c.venue ?? ""}` }; }),
      ...data.duties.filter((d) => d.soldier_id === sid && d.date === date).map((d) => ({ key: d.id, kind: "duty" as const, time: d.shift ?? "", title: d.duty_type, group: `duty|${d.duty_type}|${d.shift ?? ""}` })),
      ...data.leave.filter((l) => l.soldier_id === sid && isOnLeave(l, date)).map((l) => ({ key: l.id, kind: "leave" as const, time: "", title: `${leaveName(l.leave_type_id)} till ${fmtDate(l.to_date, false)}`, spanTitle: leaveFull(l.leave_type_id), group: `leave|${l.id}`, from: l.from_date, to: l.to_date })),
      ...data.courses.filter((c) => c.soldier_id === sid && ["Nominated", "Attending"].includes(c.status) && c.from_date && c.from_date <= date && (c.to_date ?? c.from_date) >= date).map((c) => ({ key: c.id, kind: "course" as const, time: "", title: c.course_name, venue: c.institution, group: `course|${c.id}`, from: c.from_date, to: c.to_date ?? c.from_date })),
    ];
    return out.sort((a, b) => a.time.localeCompare(b.time));
  };
  const shown = only ? officers.filter((o) => o.id === only) : officers;
  // Continuous entries (leave, course, a commitment repeated on following days) become one bar;
  // overlapping bars go on separate lanes. Single-day entries stay in their day.
  const layout = (sid: string) => {
    const perDay = days.map((d) => itemsFor(sid, d));
    const spans: Span[] = [];
    const singles: Item[][] = days.map(() => []);
    const used = new Set<string>();
    perDay.forEach((list, i) => {
      for (const it of list) {
        if (used.has(`${it.group}@${i}`)) continue;
        let j = i;
        while (j + 1 < days.length && perDay[j + 1].some((x) => x.group === it.group)) j++;
        for (let k = i; k <= j; k++) used.add(`${it.group}@${k}`);
        const multi = j > i || (!!it.from && !!it.to && it.from !== it.to);
        if (multi) spans.push({ item: it, i, j, rows: perDay.slice(i, j + 1).map((l) => l.find((x) => x.group === it.group)?.row).filter(Boolean) as OfficerCommitment[] });
        else singles[i].push(it);
      }
    });
    spans.sort((a, b) => a.i - b.i || b.j - b.i - (a.j - a.i));
    const lanes: Span[][] = [];
    for (const sp of spans) {
      let lane = lanes.find((l) => l.every((x) => x.j < sp.i || x.i > sp.j));
      if (!lane) lanes.push((lane = []));
      lane.push(sp);
    }
    return { lanes, singles };
  };
  // whole length of the entry (a leave of 27 days shows 27, not only the days of this week)
  const spanDays = (sp: Span) => Math.round((Date.parse(sp.item.to ?? days[sp.j]) - Date.parse(sp.item.from ?? days[sp.i])) / 86_400_000) + 1;
  const spanDates = (sp: Span) => {
    const from = sp.item.from ?? days[sp.i];
    const to = sp.item.to ?? days[sp.j];
    return `${fmtDate(from, false)} – ${fmtDate(to, false)}`;
  };
  const coToday = co ? itemsFor(co.id, today) : [];
  const busyToday = officers.filter((o) => itemsFor(o.id, today).length > 0).length;

  async function pdf() {
    await exportReportPdf({
      filename: `Officers_Commitments_${days[0]}`, unit: settings.unit.name, title: "CO's & Officers' Commitments", orientation: "landscape", compact: true,
      subtitle: `Week ${fmtDate(days[0])} – ${fmtDate(days[6])} (Sun–Sat · Fri & Sat holiday)`,
      sections: [{
        serial: false, color: "#1c3d57",
        columns: [{ header: "Officer", key: "who", width: 38 }, ...days.map((d) => ({ header: `${WEEKDAYS[weekday(d)]} ${fmtDate(d, false)}${isWeekend(d) ? " (H)" : ""}`, key: d }))],
        rows: shown.flatMap((o) => {
          const { lanes, singles } = layout(o.id);
          const who = { content: `${o.rank} ${o.name}`, rowSpan: lanes.length + 1 };
          const laneRows = lanes.map((lane, li) => {
            const row: Record<string, PdfCell | string> = li === 0 ? { who } : {};
            for (const sp of lane) row[days[sp.i]] = { content: `${sp.item.time ? sp.item.time + " " : ""}${sp.item.spanTitle ?? sp.item.title} — ${spanDates(sp)}${sp.item.venue ? ` (${sp.item.venue})` : ""}`, colSpan: sp.j - sp.i + 1, fill: KIND_COLOR[sp.item.kind] };
            return row;
          });
          const dayRow: Record<string, PdfCell | string> = { ...(lanes.length ? {} : { who }), ...Object.fromEntries(days.map((d, di) => [d, singles[di].map((i) => `${i.time ? i.time + " " : ""}${i.title}${i.venue ? ` (${i.venue})` : ""}`).join("\n")])) };
          return [...laneRows, dayRow];
        }),
      }],
    });
  }

  if (!perms.isOfficer) return <div className="page"><Alert tone="red">{t("Only officers can see officers' commitments.")}</Alert></div>;
  return (
    <div className="page">
      <PageHeader eyebrow="Daily Activities" title="Officers' Daily Commitments" subtitle={`${fmtDate(days[0])} – ${fmtDate(days[6])}`}
        actions={<>
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week"><ChevronLeft size={16} /></button>
          <button className="btn btn-sm" onClick={() => setStart(weekStart(today))}>{t("This week")}</button>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week"><ChevronRight size={16} /></button>
          <Select value={only} onChange={setOnly} placeholder="All officers" options={officers.map((o) => ({ value: o.id, label: `${o.rank} ${o.name}` }))} />
          <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
          <button className="btn" onClick={() => run(pdf, "PDF downloaded")}><FileText size={15} /> PDF</button>
          {(perms.isSuper || mine.length > 0) && <button className="btn btn-primary" onClick={() => setEdit({ date: today, soldier_id: perms.isSuper ? co?.id : mine[0] })}><Plus size={15} /> {t("Add commitment")}</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          {co && (
            <Card className="mb co-today" title={<><CalendarCheck size={16} /> {t("CO today")} — {co.rank} {co.name}</>} actions={<span className="muted small">{fmtDateLong(today)} · {busyToday}/{officers.length} {t("officers committed today")}</span>}>
              {coToday.length === 0 ? <Empty>{t("No commitment recorded for the CO today.")}</Empty> : (
                <div className="commit-strip">{coToday.map((i) => (
                  <button key={i.key} className="commit-big" style={{ ["--c" as string]: KIND_COLOR[i.kind] }} onClick={() => i.row && setEdit(i.row)}>
                    <span>{i.time || t(KIND_LABEL[i.kind])}</span><strong>{i.title}</strong>{i.venue && <small>{i.venue}</small>}
                  </button>
                ))}</div>
              )}
            </Card>
          )}
          <Card pad={false}>
            {officers.length === 0 ? <Empty>No serving officers.</Empty> : (
              <div className="table-wrap"><table className="table compact bordered commit-table">
                <thead><tr><th className="sticky-col">{t("Officer")}</th>{days.map((d) => <th key={d} className={cls(isWeekend(d) && "holiday", d === today && "strong")}>{WEEKDAYS[weekday(d)]} {fmtDate(d, false)}{isWeekend(d) && <small className="holiday-tag">{t("Holiday")}</small>}</th>)}</tr></thead>
                <tbody>{shown.map((o, oi) => {
                  const { lanes, singles } = layout(o.id);
                  const isCo = oi === 0 && !only;
                  const nameCell = <td className="sticky-col strong commit-who" rowSpan={lanes.length + 1}>{o.rank} {o.name}{isCo && <> <Badge tone="navy">CO</Badge></>}</td>;
                  return (
                    <Fragment key={o.id}>
                      {lanes.map((lane, li) => {
                        const cells: React.ReactNode[] = [];
                        for (let c = 0; c < days.length; c++) {
                          const sp = lane.find((x) => x.i === c);
                          if (sp) {
                            const contL = !!sp.item.from && sp.item.from < days[0] && sp.i === 0;
                            const contR = !!sp.item.to && sp.item.to > days[days.length - 1] && sp.j === days.length - 1;
                            const editable = sp.rows.length > 0 && canEditOf(o.id);
                            cells.push(
                              <td key={c} colSpan={sp.j - sp.i + 1} className="span-cell">
                                <div className={cls("span-bar", contL && "cont-l", contR && "cont-r")} style={{ ["--c" as string]: KIND_COLOR[sp.item.kind] }}>
                                  <button className="span-body" disabled={!editable} onClick={() => editable && setEdit(sp.rows[0])} title={`${sp.item.spanTitle ?? sp.item.title} · ${spanDates(sp)}`}>
                                    <strong>{sp.item.time && <em>{sp.item.time}</em>}{sp.item.spanTitle ?? sp.item.title}</strong>
                                    <span>{spanDates(sp)}{sp.item.venue ? ` · ${sp.item.venue}` : ""}{spanDays(sp) > 1 ? ` · ${spanDays(sp)} ${t("days")}` : ""}</span>
                                  </button>
                                  {editable && <button className="commit-del no-print" aria-label="Delete" onClick={() => undoable({ text: `${sp.rows.length} ${t("commitment(s) deleted")}`, act: () => Promise.all(sp.rows.map((r) => deleteCommitment(r.id))).then(() => undefined), undo: () => Promise.all(sp.rows.map((r) => restoreRow("officer_commitments", r))).then(() => undefined), after: reload })}><Trash2 size={11} /></button>}
                                </div>
                              </td>,
                            );
                            c = sp.j;
                          } else cells.push(<td key={c} className={cls("span-cell", "span-empty", isWeekend(days[c]) && "holiday", days[c] === today && "today-col")} />);
                        }
                        return <tr key={`${o.id}-l${li}`} className={cls("span-row", isCo && "co-row")}>{li === 0 && nameCell}{cells}</tr>;
                      })}
                      <tr className={cls(isCo && "co-row", lanes.length > 0 && "after-spans")}>
                        {lanes.length === 0 && nameCell}
                        {days.map((d, di) => (
                          <td key={d} className={cls(isWeekend(d) && "holiday", d === today && "today-col")}>
                            {singles[di].map((i) => (
                              <div key={i.key} className="commit-item" style={{ ["--c" as string]: KIND_COLOR[i.kind] }}>
                                <button className="commit-body" disabled={!i.row || !canEditOf(o.id)} onClick={() => i.row && setEdit(i.row)} title={i.row ? t("Edit") : t(KIND_LABEL[i.kind])}>
                                  {i.time && <span>{i.time}</span>}<strong>{i.title}</strong>{i.venue && <small>{i.venue}</small>}
                                </button>
                                {i.row && canEditOf(o.id) && <button className="commit-del no-print" aria-label="Delete" onClick={() => undoable({ text: "Commitment deleted", act: () => deleteCommitment(i.row!.id), undo: () => restoreRow("officer_commitments", i.row!), after: reload })}><Trash2 size={10} /></button>}
                              </div>
                            ))}
                            {canEditOf(o.id) && <button className="btn btn-xs btn-ghost no-print commit-add" onClick={() => setEdit({ date: d, soldier_id: o.id })} aria-label="Add"><Plus size={10} /></button>}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
          <div className="legend mt">{(Object.keys(KIND_COLOR) as Item["kind"][]).map((k) => <span key={k}><i style={{ background: KIND_COLOR[k] }} />{t(KIND_LABEL[k])}{k !== "own" && ` (${t("automatic")})`}</span>)}</div>
        </>
      )}
      {edit && <CommitmentModal value={edit} officers={perms.isSuper ? officers : officers.filter((o) => mine.includes(o.id))} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function CommitmentModal({ value, officers, onClose, onDone }: { value: Partial<OfficerCommitment>; officers: DirectoryEntry[]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Partial<OfficerCommitment>>(value);
  const [repeat, setRepeat] = useState(0);
  const { busy, run } = useAction();
  const set = <K extends keyof OfficerCommitment>(k: K, x: OfficerCommitment[K]) => setV((cur) => ({ ...cur, [k]: x }));
  return (
    <Modal open onClose={onClose} title={v.id ? "Edit commitment" : "Add commitment"}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !v.soldier_id || !v.date || !v.title?.trim()}
        onClick={() => run(async () => {
          const base = { soldier_id: v.soldier_id!, title: v.title!.trim(), time_from: v.time_from || null, time_to: v.time_to || null, venue: v.venue || null, remarks: v.remarks || null };
          await saveCommitment({ ...base, id: v.id, date: v.date! });
          for (let i = 1; i <= repeat; i++) await saveCommitment({ ...base, date: addDays(v.date!, i) });
          onDone();
        }, "Saved")}>Save</button></>}>
      <div className="form-grid">
        <Field label="Officer" required wide><Select value={v.soldier_id ?? ""} onChange={(x) => set("soldier_id", x)} placeholder="—" options={officers.map((o, i) => ({ value: o.id, label: `${o.rank} ${o.name}${i === 0 ? " (CO)" : ""}` }))} /></Field>
        <Field label="Commitment" required wide><input className="input" value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Conference at Bde HQ, Visit to Radio Coy, Firing" autoFocus /></Field>
        <Field label="Date" required><input className="input" type="date" value={v.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="From"><input className="input" type="time" value={v.time_from ?? ""} onChange={(e) => set("time_from", e.target.value)} /></Field>
        <Field label="To"><input className="input" type="time" value={v.time_to ?? ""} onChange={(e) => set("time_to", e.target.value)} /></Field>
        <Field label="Venue"><input className="input" value={v.venue ?? ""} onChange={(e) => set("venue", e.target.value)} /></Field>
        <Field label="Remarks" wide><input className="input" value={v.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
        {!v.id && <Field label="Repeat on the next days" hint="e.g. 4 for a five-day exercise"><input className="input" type="number" min={0} max={30} value={repeat} onChange={(e) => setRepeat(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} /></Field>}
      </div>
    </Modal>
  );
}
