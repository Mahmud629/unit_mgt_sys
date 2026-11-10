"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { Alert, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, SoldierPicker, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { restoreRow, deleteDuty, listDuties, saveDuty } from "@/lib/api";
import { colorFor } from "@/lib/colors";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { WEEKDAYS, addDays, bdToday, cls, fmtDate, isWeekend, weekStart, weekday } from "@/lib/utils";

export default function DutyRosterPage() {
  const { perms, profile, settings, directoryById, companyById } = useSession();
  const today = bdToday();
  const [start, setStart] = useState(() => weekStart(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [add, setAdd] = useState<{ date: string; duty_type: string; soldier_id: string | null; shift: string; remarks: string } | null>(null);
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const { data, error, loading, reload } = useAsync(() => listDuties(addDays(start, -30), days[6]), [start]);

  const week = useMemo(() => (data ?? []).filter((d) => d.date >= start && d.date <= days[6]), [data, start, days]);
  const types = useMemo(() => [...new Set([...settings.duty_types, ...week.map((d) => d.duty_type)])], [settings, week]);
  const count30 = (sid: string) => (data ?? []).filter((d) => d.soldier_id === sid && d.date < start).length;
  const canAdd = perms.canParadeAny;
  const busyOn = (sid: string, date: string) => (data ?? []).filter((d) => d.soldier_id === sid && d.date === date);
  // v3.4 — names stand out: click a name (or search) to highlight all his duties of the week
  const { t } = useI18n();
  const [focus, setFocus] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const q = find.trim().toLowerCase();
  const matches = (sid: string) => {
    if (!q) return false;
    const s = directoryById.get(sid);
    return !!s && [s.name, s.snk_no, s.rank].some((x) => String(x ?? "").toLowerCase().includes(q));
  };
  const lit = (sid: string) => focus === sid || matches(sid);
  const anyLit = !!focus || (!!q && week.some((d) => matches(d.soldier_id)));
  const shortName = (name?: string | null) => { const w = String(name ?? "").split(/\s+/).filter(Boolean); return w.length > 2 ? w.slice(-2).join(" ") : w.join(" "); };
  const focusDuties = focus ? week.filter((d) => d.soldier_id === focus) : [];

  return (
    <div className="page">
      <PageHeader eyebrow="Daily Activities" title="Duty Roster" subtitle={`${fmtDate(days[0])} – ${fmtDate(days[6])}`}
        actions={<>
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></button>
          <button className="btn btn-sm" onClick={() => setStart(weekStart(today))}>This week</button>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></button>
          <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
          {canAdd && <button className="btn btn-primary" onClick={() => setAdd({ date: today, duty_type: types[0] ?? "", soldier_id: null, shift: "", remarks: "" })}><Plus size={15} /> Detail duty</button>}
        </>} />
      <div className="print-only report-title"><h2>{settings.unit.name} — Duty Roster</h2><p>{fmtDate(days[0])} to {fmtDate(days[6])}</p></div>
      <ErrorBox error={error} onRetry={reload} />
      {perms.isSoldier && profile.soldier_id && week.some((d) => d.soldier_id === profile.soldier_id) && <Alert tone="amber">You are detailed for duty this week — highlighted below.</Alert>}
      <div className="roster-tools no-print">
        <label className="roster-find"><Search size={14} /><input className="input" value={find} onChange={(e) => { setFind(e.target.value); setFocus(null); }} placeholder={t("Find a name or Personal No…")} />{find && <button type="button" onClick={() => setFind("")} aria-label="Clear"><X size={13} /></button>}</label>
        {focus ? (
          <span className="roster-focus">
            <strong>{directoryById.get(focus)?.rank} {directoryById.get(focus)?.name}</strong> · {focusDuties.length} {t("duty(ies) this week")}: {focusDuties.map((d) => `${WEEKDAYS[weekday(d.date)]} ${d.duty_type}`).join(", ")}
            <button type="button" className="btn btn-xs" onClick={() => setFocus(null)}><X size={12} /> {t("Clear")}</button>
          </span>
        ) : <span className="muted small">{t("Click a name to highlight all his duties this week.")}</span>}
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap"><table className="table compact bordered">
            <thead><tr><th className="sticky-col">Duty</th>{days.map((d) => <th key={d} className={cls(d === today && "strong", isWeekend(d) && "holiday")}>{WEEKDAYS[weekday(d)]} {fmtDate(d, false)}{isWeekend(d) && <small className="holiday-tag">Holiday</small>}</th>)}</tr></thead>
            <tbody>{types.map((dt) => (
              <tr key={dt}>
                <td className="sticky-col strong nowrap">{dt}</td>
                {days.map((d) => {
                  const list = week.filter((x) => x.date === d && x.duty_type === dt);
                  return (
                    <td key={d} className={cls(isWeekend(d) && "holiday", d === today && "today-col")} style={{ minWidth: 178, verticalAlign: "top" }}>
                      {list.map((x) => {
                        const s = directoryById.get(x.soldier_id);
                        const mine = x.soldier_id === profile.soldier_id;
                        return (
                          <div key={x.id} className={cls("duty-name", mine && "mine", lit(x.soldier_id) && "lit", anyLit && !lit(x.soldier_id) && "dim")} style={{ ["--coy" as string]: colorFor(companyById.get(x.company_id ?? "")?.short_name ?? "") }}>
                            <button type="button" className="duty-who" onClick={() => setFocus(focus === x.soldier_id ? null : x.soldier_id)} title={`${s?.rank ?? ""} ${s?.name ?? ""} · ${s?.snk_no ?? ""} · ${companyById.get(x.company_id ?? "")?.name ?? ""}`}>
                              <b>{shortName(s?.name)}</b>
                              <small>{x.shift && <em>{x.shift}</em>}{s?.rank}{s?.snk_no ? ` · ${s.snk_no}` : ""}{companyById.get(x.company_id ?? "")?.short_name ? ` · ${companyById.get(x.company_id ?? "")?.short_name}` : ""}</small>
                              {mine && <i className="duty-you">{t("You")}</i>}
                            </button>
                            {perms.canRosterCompany(x.company_id) && <button className="btn btn-xs btn-ghost no-print" style={{ height: 18, padding: "0 3px" }} onClick={() => undoable({ text: "Duty removed", act: () => deleteDuty(x.id), undo: () => restoreRow("duty_roster", x), after: reload })}><Trash2 size={10} /></button>}
                          </div>
                        );
                      })}
                      {canAdd && <button className="btn btn-xs btn-ghost no-print" style={{ height: 20, opacity: 0.6 }} onClick={() => setAdd({ date: d, duty_type: dt, soldier_id: null, shift: "", remarks: "" })}><Plus size={10} /></button>}
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {types.length === 0 && <Empty>No duty types configured (Settings).</Empty>}

      <Modal open={!!add} onClose={() => setAdd(null)} title="Detail a duty"
        footer={<><button className="btn" onClick={() => setAdd(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !add?.soldier_id || !add?.duty_type} onClick={() => run(async () => { await saveDuty({ date: add!.date, duty_type: add!.duty_type, soldier_id: add!.soldier_id!, shift: add!.shift || null, remarks: add!.remarks || null }); setAdd((a) => a && { ...a, soldier_id: null }); reload(); }, "Duty detailed")}>Save</button></>}>
        {add && <div className="form-grid">
          <Field label="Date"><input className="input" type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} /></Field>
          <Field label="Duty"><Select value={add.duty_type} onChange={(v) => setAdd({ ...add, duty_type: v })} options={types} /></Field>
          <Field label="Soldier" wide required hint={add.soldier_id ? `${count30(add.soldier_id)} duties in the previous 30 days${busyOn(add.soldier_id, add.date).length ? ` · already on ${busyOn(add.soldier_id, add.date).map((d) => d.duty_type).join(", ")} this day` : ""}` : undefined}>
            <SoldierPicker value={add.soldier_id} onChange={(id) => setAdd({ ...add, soldier_id: id })} filter={(s) => perms.canRosterCompany(s.company_id)} />
          </Field>
          <Field label="Shift / time"><input className="input" value={add.shift} onChange={(e) => setAdd({ ...add, shift: e.target.value })} placeholder="e.g. 0600-1200" /></Field>
          <Field label="Remarks"><input className="input" value={add.remarks} onChange={(e) => setAdd({ ...add, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
