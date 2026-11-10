"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock, History, Copy, FileText, Lock, Plus, RefreshCw, RotateCcw, Search, Send, Undo2, Unlock, Wand2 } from "lucide-react";
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat, useAction, useAsync, useConfirm } from "@/components/ui";
import {
  copyParadeState, ensureParadeStates, finalizeParadeState, getParadeStatesForDate, listParadeEntries, listSubmissions, openExtraState, reopenParadeState,
  setSubmissionStatus, syncParadeState, updateParadeEntry,
} from "@/lib/api";
import { exportParadeStatePdf } from "@/lib/reports";
import { summarizeParade } from "@/lib/compute";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { CoySubmission, ParadeEntry, ParadeState } from "@/lib/types";
import { addDays, bdToday, cls, fmtDateLong, fmtDateTime, sortSoldiers, strengthLabel, strengthTotal } from "@/lib/utils";

const SUB_TONE: Record<string, string> = { Draft: "grey", Submitted: "blue", Accepted: "green", Returned: "red" };

export default function ParadeStatePage() {
  const params = useSearchParams();
  const session = useSession();
  const { perms, myCompanies, directoryById, companyById, settings } = session;
  const { nameOf, t: tr } = useI18n();
  const today = bdToday();
  const [date, setDate] = useState(params.get("date") ?? today);
  const [stateId, setStateId] = useState<string | null>(params.get("state"));
  const [extraOpen, setExtraOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const [coy, setCoy] = useState(params.get("coy") ?? myCompanies[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "absent" | "employed" | "parade">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { busy, run } = useAction();
  const confirm = useConfirm();

  const { data, error, loading, reload, setData } = useAsync(async () => {
    // Morning State and 2nd Parade State open by themselves (1800 hrs the evening before)
    try { await ensureParadeStates(date); } catch { /* view-only role or date too far ahead */ }
    const states: ParadeState[] = await getParadeStatesForDate(date);
    const ids = states.map((s) => s.id);
    const [entries, subs] = await Promise.all([listParadeEntries(ids), listSubmissions(ids)]);
    return { states, entries, subs };
  }, [date]);

  useEffect(() => {
    if (!data) return;
    const t = new Date().toISOString();
    // default: the state that is open right now, else the Morning State
    const live = data.states.find((s) => s.status === "Open" && (!s.opens_at || s.opens_at <= t) && (!s.closes_at || s.closes_at > t));
    setStateId((id) => (id && data.states.some((s) => s.id === id) ? id : live?.id ?? data.states[0]?.id ?? null));
  }, [data]);
  useEffect(() => setSelected(new Set()), [coy, stateId, date]);

  const state = data?.states.find((s) => s.id === stateId) ?? null;
  const nowIso = new Date(now).toISOString();
  const notYetOpen = !!state?.opens_at && state.status === "Open" && nowIso < state.opens_at;
  const timeLeft = state?.closes_at && state.status === "Open" ? Math.max(0, Date.parse(state.closes_at) - now) : null;
  const entries = useMemo(() => (data && state ? data.entries.filter((e) => e.parade_state_id === state.id) : []), [data, state]);
  const subs = useMemo(() => (data && state ? data.subs.filter((s) => s.parade_state_id === state.id) : []), [data, state]);
  const sub = subs.find((s) => s.company_id === coy);
  const { byCompany, total } = useMemo(() => summarizeParade(entries.filter((e) => perms.canViewCompany(e.company_id)), directoryById), [entries, directoryById, perms]);
  const coySum = byCompany.get(coy);

  const editable = !!state && state.status === "Open" && perms.canParadeCompany(coy) && (perms.isParadeMaster || (!notYetOpen && (!sub || !["Submitted", "Accepted"].includes(sub.status))));
  const copySources = (data?.states ?? []).filter((s) => s.id !== state?.id);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = entries.filter((e) => e.company_id === coy).map((e) => ({ e, s: directoryById.get(e.soldier_id) })).filter(({ e, s }) => {
      if (filter === "absent" && e.state !== "Absent") return false;
      if (filter === "employed" && !(e.state === "Present" && e.employment)) return false;
      if (filter === "parade" && !(e.state === "Present" && !e.employment)) return false;
      if (term && !`${s?.snk_no} ${s?.rank} ${s?.name}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const sorted = sortSoldiers(list.map((x) => ({ ...x, category: x.s?.category, display_order: x.s?.display_order, snk_no: x.s?.snk_no })));
    return sorted;
  }, [entries, coy, filter, q, directoryById]);

  function patchLocal(id: string, patch: Partial<ParadeEntry>) {
    setData((d) => (d ? { ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : d));
  }
  async function change(e: ParadeEntry, patch: Partial<ParadeEntry>) {
    const next = { ...patch };
    if (next.state === "Absent") { next.employment = null; next.absent_reason = next.absent_reason ?? e.absent_reason ?? "Other"; }
    if (next.state === "Present") next.absent_reason = null;
    patchLocal(e.id, { ...next, is_manual: true });
    try {
      const saved = await updateParadeEntry(e.id, next);
      patchLocal(e.id, saved);
    } catch (err) {
      patchLocal(e.id, e);
      await run(async () => { throw err; });
    }
  }
  async function resetAuto(e: ParadeEntry) {
    await run(async () => { await updateParadeEntry(e.id, { is_manual: false }); await syncParadeState(e.parade_state_id); reload(); }, "Line reset to automatic value");
  }
  async function bulk(patch: Partial<ParadeEntry>) {
    const list = rows.filter((r) => selected.has(r.e.id)).map((r) => r.e);
    await run(async () => { for (const e of list) await change(e, patch); setSelected(new Set()); }, `${list.length} line(s) updated`);
  }
  const subAction = (status: CoySubmission["status"], company = coy, remarks?: string) =>
    run(async () => { await setSubmissionStatus(state!.id, company, status, remarks ?? null); reload(); }, { Draft: "Recalled for correction", Submitted: "State submitted to Adjt", Accepted: "Accepted", Returned: "Returned to company" }[status]);

  async function finalize() {
    const pending = subs.filter((s) => companyById.get(s.company_id)?.active && !["Submitted", "Accepted"].includes(s.status)).length;
    if (pending && !confirm(`${pending} company state(s) are not yet submitted. Finalize anyway?`)) return;
    await run(async () => { await finalizeParadeState(state!.id, pending > 0); reload(); }, `${state!.state_type} finalized`);
  }
  async function copyFrom(fromId: string) {
    const from = data?.states.find((s) => s.id === fromId);
    if (!from || !state) return;
    await run(async () => { const n = await copyParadeState(fromId, state.id, perms.isParadeMaster ? null : coy); reload(); return n; }, `Copied from ${from.state_type}`);
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Parade State" title="Daily Parade State" subtitle={fmtDateLong(date)}
        actions={<>
          <input className="input" type="date" value={date} max={addDays(today, 1)} onChange={(e) => setDate(e.target.value || today)} style={{ width: 160 }} />
          <Link className="btn" href="/parade-state/history"><History size={15} /> {tr("History & Reports")}</Link>
          {state && <Link className="btn" href={`/parade-state/report?id=${state.id}`}><FileText size={15} /> Report</Link>}
          {state && <button className="btn" onClick={() => run(() => exportParadeStatePdf(session, state.id), "PDF downloaded")}><FileText size={15} /> PDF</button>}
          {state?.status === "Open" && <button className="btn" disabled={busy} onClick={() => run(async () => { await syncParadeState(state.id); reload(); }, "Updated from leave, courses, sick reports and duty roster")}><Wand2 size={15} /> Refresh auto</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : !data || data.states.length === 0 ? (
        <Card><Empty>{date > today ? tr("The parade state for this date opens at 1800 hrs the evening before.") : tr("No parade state exists for this date.")}</Empty>
          {perms.isParadeMaster && <div className="row" style={{ justifyContent: "center", paddingBottom: 18 }}><button className="btn btn-primary" onClick={() => setExtraOpen(true)}><Plus size={15} /> {tr("Open a state now")}</button></div>}</Card>
      ) : (
        <>
          <div className="state-tabs mb">
            {data.states.map((st) => {
              const open = st.status === "Open";
              const pending = open && !!st.opens_at && nowIso < st.opens_at;
              return (
                <button key={st.id} className={cls("state-tab", st.id === stateId && "on", st.kind === "Extra" && "extra")} onClick={() => setStateId(st.id)}>
                  <strong>{tr(st.state_type)}</strong>
                  <span className={cls("state-chip", !open ? "done" : pending ? "wait" : "live")}>
                    {!open ? <><Lock size={10} /> {tr("Finalized")}</> : pending ? <><Clock size={10} /> {tr("Opens")} {fmtClock(st.opens_at)}</> : <><Clock size={10} /> {tr("Closes")} {fmtClock(st.closes_at)}</>}
                  </span>
                </button>
              );
            })}
            {perms.isParadeMaster && date >= addDays(today, -1) && <button className="state-tab add" onClick={() => setExtraOpen(true)}><Plus size={15} /> {tr("Open another state")}</button>}
          </div>

          {state && (
            <div className="row-between mb">
              <div className="row small">
                {state.status === "Finalized" ? <Badge tone="green"><Lock size={11} /> {tr("Finalized")} {fmtDateTime(state.finalized_at)}</Badge>
                  : notYetOpen ? <Badge tone="grey"><Clock size={11} /> {tr("Opens")} {fmtDateTime(state.opens_at)}</Badge>
                  : <Badge tone={timeLeft !== null && timeLeft < 3600_000 ? "red" : "amber"}><Clock size={11} /> {tr("Closes")} {fmtDateTime(state.closes_at)}{timeLeft !== null ? ` · ${leftLabel(timeLeft)}` : ""}</Badge>}
                {state.status === "Open" && <span className="muted">{tr("It is finalized automatically at the closing time.")}</span>}
              </div>
              <div className="row">
                {state.status === "Open" && editable && copySources.length > 0 && (
                  <div style={{ width: 210 }}>
                    <select className="input input-sm" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)} aria-label={tr("Copy from")}>
                      <option value="">{tr("Copy lines from…")}</option>
                      {copySources.map((x) => <option key={x.id} value={x.id}>{tr(x.state_type)}</option>)}
                    </select>
                  </div>
                )}
                {perms.canFinalizeParade && state.status === "Open" && <button className="btn btn-green" disabled={busy} onClick={finalize}><CheckCheck size={15} /> {tr("Finalize now")}</button>}
                {perms.isSuper && state.status === "Finalized" && <button className="btn" disabled={busy} onClick={() => run(async () => { await reopenParadeState(state.id); reload(); }, "State reopened for 2 hours")}><Unlock size={15} /> {tr("Reopen")}</button>}
              </div>
            </div>
          )}

          <div className="stats">
            <Stat label={perms.canViewAll ? "Unit posted" : "Posted"} value={strengthLabel(total.posted)} sub={`${strengthTotal(total.posted)}`} tone="navy" />
            <Stat label="Present" value={strengthLabel(total.present)} sub={`${strengthTotal(total.present)}`} tone="green" />
            <Stat label="Absent" value={strengthLabel(total.absent)} sub={`${strengthTotal(total.absent)}`} tone="red" />
            <Stat label="Employed" value={strengthLabel(total.employed)} sub={`${strengthTotal(total.employed)}`} tone="blue" />
            <Stat label="On Parade" value={strengthLabel(total.onParade)} sub={`${strengthTotal(total.onParade)}`} tone="amber" />
          </div>

          {perms.canViewAll && (
            <Card title="Company submissions" className="mb" pad={false}>
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>Coy</th><th className="num">Posted</th><th className="num">Absent</th><th className="num">Employed</th><th className="num">On Parade</th><th>Status</th><th>Submitted</th><th className="right">Action</th></tr></thead>
                <tbody>{myCompanies.map((c) => {
                  const s = subs.find((x) => x.company_id === c.id);
                  const sum = byCompany.get(c.id);
                  return (
                    <tr key={c.id} className={c.id === coy ? "row-highlight" : undefined}>
                      <td><button className="link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => setCoy(c.id)}>{c.name}</button></td>
                      <td className="num mono">{sum ? strengthLabel(sum.posted) : "—"}</td><td className="num mono">{sum ? strengthLabel(sum.absent) : "—"}</td><td className="num mono">{sum ? strengthLabel(sum.employed) : "—"}</td><td className="num mono">{sum ? strengthLabel(sum.onParade) : "—"}</td>
                      <td><Badge tone={SUB_TONE[s?.status ?? "Draft"]}>{s?.status ?? "—"}</Badge>{s?.remarks && <span className="small muted"> {s.remarks}</span>}</td>
                      <td className="small muted">{fmtDateTime(s?.submitted_at)}</td>
                      <td className="right nowrap">
                        {state?.status === "Open" && perms.isParadeMaster && s?.status === "Submitted" && <>
                          <button className="btn btn-xs btn-green" disabled={busy} onClick={() => subAction("Accepted", c.id)}>Accept</button>
                          <button className="btn btn-xs btn-red" disabled={busy} onClick={() => { const r = window.prompt("Reason for returning:"); if (r !== null) void subAction("Returned", c.id, r); }}>Return</button>
                        </>}
                        {state?.status === "Open" && perms.canParadeCompany(c.id) && ["Draft", "Returned"].includes(s?.status ?? "") && <button className="btn btn-xs" disabled={busy} onClick={() => subAction("Submitted", c.id)}>Submit</button>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </Card>
          )}

          <Card pad={false}
            title={<>{myCompanies.length > 1 ? <Select value={coy} onChange={setCoy} options={myCompanies.map((c) => ({ value: c.id, label: c.name }))} /> : companyById.get(coy)?.name}
              {sub && <Badge tone={SUB_TONE[sub.status]}>{sub.status}</Badge>}
              {coySum && <span className="small muted mono">{tr("Posted")} {strengthLabel(coySum.posted)} · {tr("Absent")} {strengthLabel(coySum.absent)} · {tr("Employed")} {strengthLabel(coySum.employed)} · {tr("On Parade")} {strengthLabel(coySum.onParade)}</span>}</>}
            actions={state?.status === "Open" && perms.canParadeCompany(coy) && <>
              {sub && ["Draft", "Returned"].includes(sub.status) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => subAction("Submitted")}><Send size={13} /> Submit to Adjt</button>}
              {sub?.status === "Submitted" && <button className="btn btn-sm" disabled={busy} onClick={() => subAction("Draft")}><Undo2 size={13} /> Recall</button>}
            </>}>
            <div style={{ padding: "12px 18px 0" }}>
              {sub?.status === "Returned" && <Alert tone="red">Returned by Adjt{sub.remarks ? `: ${sub.remarks}` : ""}. Correct and submit again.</Alert>}
              {state?.status === "Open" && !editable && perms.canParadeCompany(coy) && <Alert tone="blue">This company&apos;s state is submitted. Recall it to make corrections.</Alert>}
              <div className="toolbar">
                <div className="seg">
                  {([["all", "All"], ["absent", "Absent"], ["employed", "Employed"], ["parade", "On parade"]] as const).map(([k, l]) => <button key={k} className={cls(filter === k && "on")} onClick={() => setFilter(k)}>{l}</button>)}
                </div>
                <div className="search"><Search size={15} /><input className="input" placeholder="Find soldier…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                {editable && selected.size > 0 && <>
                  <span className="small strong">{selected.size} selected:</span>
                  <select className="input input-sm" style={{ width: 150 }} value="" onChange={(e) => e.target.value && bulk(e.target.value === "__parade" ? { state: "Present", employment: null } : { state: "Present", employment: e.target.value })}>
                    <option value="">Set employed as…</option><option value="__parade">On parade</option>{settings.employment_types.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <select className="input input-sm" style={{ width: 140 }} value="" onChange={(e) => e.target.value && bulk({ state: "Absent", absent_reason: e.target.value })}>
                    <option value="">Set absent as…</option>{settings.absent_reasons.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </>}
              </div>
            </div>
            {rows.length === 0 ? <Empty>No soldiers in this view.</Empty> : (
              <div className="table-wrap tall">
                <table className="table">
                  <thead><tr>
                    {editable && <th style={{ width: 30 }}><input type="checkbox" checked={selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.e.id)) : new Set())} /></th>}
                    <th className="sticky-col">Soldier</th><th>State</th><th>Absent reason / Employment</th><th>Location</th><th>Remarks</th><th>Source</th>
                  </tr></thead>
                  <tbody>{rows.map(({ e, s }) => (
                    <tr key={e.id}>
                      {editable && <td><input type="checkbox" checked={selected.has(e.id)} onChange={(ev) => setSelected((set) => { const n = new Set(set); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} /></td>}
                      <td className="sticky-col"><div className="who"><Link href={`/soldiers/view?id=${e.soldier_id}`} className="strong">{s?.rank} {s ? nameOf(s) : ""}</Link><span>{s?.snk_no} · {s?.trade ?? s?.category}</span></div></td>
                      <td>
                        {editable ? (
                          <div className="seg">
                            <button className={cls(e.state === "Present" && "on")} onClick={() => e.state !== "Present" && change(e, { state: "Present" })}>Present</button>
                            <button className={cls(e.state === "Absent" && "on")} onClick={() => e.state !== "Absent" && change(e, { state: "Absent" })}>Absent</button>
                          </div>
                        ) : <Badge tone={e.state === "Absent" ? "red" : e.employment ? "blue" : "green"}>{e.state === "Absent" ? "Absent" : e.employment ? "Employed" : "On parade"}</Badge>}
                      </td>
                      <td style={{ minWidth: 170 }}>
                        {editable ? (e.state === "Absent"
                          ? <select className="input input-sm" value={e.absent_reason ?? ""} onChange={(ev) => change(e, { absent_reason: ev.target.value })}>{[...new Set([...settings.absent_reasons, e.absent_reason ?? ""])].filter(Boolean).map((r) => <option key={r}>{r}</option>)}</select>
                          : <select className="input input-sm" value={e.employment ?? ""} onChange={(ev) => change(e, { employment: ev.target.value || null })}><option value="">On parade</option>{[...new Set([...settings.employment_types, e.employment ?? ""])].filter(Boolean).map((r) => <option key={r}>{r}</option>)}</select>)
                          : <span>{e.state === "Absent" ? e.absent_reason : e.employment ?? "On parade"}</span>}
                      </td>
                      <td>{editable ? <input key={`l${e.id}${e.location}`} className="input input-sm" defaultValue={e.location ?? ""} onBlur={(ev) => ev.target.value !== (e.location ?? "") && change(e, { location: ev.target.value || null })} /> : e.location ?? ""}</td>
                      <td>{editable ? <input key={`r${e.id}${e.remarks}`} className="input input-sm" defaultValue={e.remarks ?? ""} onBlur={(ev) => ev.target.value !== (e.remarks ?? "") && change(e, { remarks: ev.target.value || null })} /> : e.remarks ?? ""}</td>
                      <td className="small nowrap">
                        {e.is_manual ? <><Badge tone="amber">Manual</Badge>{editable && <button className="btn btn-xs btn-ghost" title="Reset to automatic" onClick={() => resetAuto(e)}><RotateCcw size={11} /></button>}</>
                          : e.auto_note ? <span className="muted" title={e.auto_note}>{tr(e.auto_note).length > 36 ? tr(e.auto_note).slice(0, 36) + "…" : tr(e.auto_note)}</span> : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="muted small mt"><RefreshCw size={11} /> {tr("Offr+JCO+OR")}</p>
        </>
      )}
      {extraOpen && <ExtraStateModal date={date} states={data?.states ?? []} onClose={() => setExtraOpen(false)} onDone={(id) => { setExtraOpen(false); setStateId(id); reload(); }} />}
    </div>
  );
}

const fmtClock = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "—");
function leftLabel(ms: number) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
}

const PRESETS = ["Durbar", "Firing", "Roll Call", "Night State", "Muster Parade"];
function ExtraStateModal({ date, states, onClose, onDone }: { date: string; states: ParadeState[]; onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const { busy, run } = useAction();
  const daily = states.length === 0;
  const [name, setName] = useState(daily ? "Morning State" : PRESETS.find((p) => !states.some((s) => s.state_type === p)) ?? "");
  const [close, setClose] = useState(daily ? "03:00" : "23:59");
  const [copy, setCopy] = useState(states.find((s) => s.kind === "Morning")?.id ?? "");
  const closeIso = (() => { const d = close < "12:00" && name === "Morning State" ? date : date; return new Date(`${d}T${close}:00+06:00`).toISOString(); })();
  return (
    <Modal open onClose={onClose} title="Open another parade state"
      footer={<><button className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => run(async () => { const id = await openExtraState(date, name.trim(), closeIso, copy || null); onDone(id); return id; }, "State opened")}><Plus size={14} /> {t("Open")}</button></>}>
      <div className="form-grid">
        <Field label="Name" wide>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Durbar" />
          <div className="row" style={{ marginTop: 6 }}>{PRESETS.map((p) => <button key={p} type="button" className={cls("chip-btn", name === p && "on")} onClick={() => setName(p)}>{t(p)}</button>)}</div>
        </Field>
        <Field label="Closes at (on this date)"><input className="input" type="time" value={close} onChange={(e) => setClose(e.target.value)} /></Field>
        {states.length > 0 && <Field label="Start from"><Select value={copy} onChange={setCopy} placeholder="Automatic lines only" options={states.map((s) => ({ value: s.id, label: s.state_type }))} /></Field>}
      </div>
    </Modal>
  );
}
