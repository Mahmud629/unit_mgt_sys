"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, CornerDownLeft, Download, FileText, Plus, Search, X } from "lucide-react";
import { exportObjectsPdf } from "@/lib/pdf";
import { Alert, Badge, Card, CompanySelect, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, SoldierPicker, Stat, Tabs, useAction, useAsync } from "@/components/ui";
import { applyLeave, leaveAction, listLeave } from "@/lib/api";
import { LEAVE_CROSSED_DAYS, isOnLeave, isOverstayed, leaveBalance, leaveDue, leaveEnd, monthsDays } from "@/lib/compute";
import { LEAVE_STATUS_TONE } from "@/lib/constants";
import { exportXlsx } from "@/lib/excel";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { LeaveApplication } from "@/lib/types";
import { addDays, bdToday, cls, currentYear, diffDays, fmtDate, fmtDateTime, soldierLabel, fmtDateFull } from "@/lib/utils";

type TabKey = "pending" | "current" | "upcoming" | "due" | "all";

export default function LeavePage() {
  const params = useSearchParams();
  const { perms, profile } = useSession();
  const [applyOpen, setApplyOpen] = useState(false);
  const { data, error, loading, reload } = useAsync(() => (perms.isSoldier && profile.soldier_id ? listLeave({ soldierId: profile.soldier_id }) : listLeave()), []);
  useEffect(() => { if (params.get("apply")) setApplyOpen(true); }, [params]);

  return (
    <div className="page">
      <PageHeader eyebrow="Leave" title={perms.isSoldier ? "My Leave" : "Leave Management"}
        actions={<button className="btn btn-primary" onClick={() => setApplyOpen(true)}><Plus size={15} /> {perms.isSoldier ? "Apply for leave" : "New application"}</button>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (perms.isSoldier ? <MyLeave leave={data} reload={reload} /> : <StaffLeave leave={data} reload={reload} initialTab={(params.get("tab") as TabKey) || "pending"} />)}
      {applyOpen && <ApplyModal existing={data ?? []} onClose={() => setApplyOpen(false)} onDone={() => { setApplyOpen(false); reload(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- soldier
function MyLeave({ leave, reload }: { leave: LeaveApplication[]; reload: () => void }) {
  const { leaveTypes } = useSession();
  const year = currentYear();
  const bal = leaveBalance(leave, leaveTypes, year);
  return (
    <div className="stack">
      <div className="stats">
        {bal.filter((b) => b.quota !== null).map((b) => <Stat key={b.type.id} label={b.type.name} value={`${b.remaining} days`} sub={`${b.used} availed of ${b.quota}${b.pending ? ` · ${b.pending} pending` : ""}`} tone={b.remaining! < 5 ? "red" : "green"} />)}
      </div>
      <Card title="My applications" pad={false}>
        {leave.length === 0 ? <Empty>You have not applied for leave yet.</Empty> : <LeaveTable rows={leave} reload={reload} hideSoldier />}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ staff
function StaffLeave({ leave, reload, initialTab }: { leave: LeaveApplication[]; reload: () => void; initialTab: TabKey }) {
  const { perms, directory, directoryById, leaveTypes, companyById, settings } = useSession();
  const { nameOf, t } = useI18n();
  const today = bdToday();
  const [tab, setTab] = useState<TabKey>(initialTab === "due" && !perms.canSeeLeaveDue ? "pending" : initialTab);
  const [applyFor, setApplyFor] = useState<string | null>(null);
  const [dueLevel, setDueLevel] = useState("");
  const [coy, setCoy] = useState("");
  const [q, setQ] = useState("");
  const [year, setYear] = useState(String(currentYear()));
  const [status, setStatus] = useState("");

  const scoped = useMemo(() => leave.filter((l) => perms.canViewCompany(l.company_id) && (!coy || l.company_id === coy)), [leave, perms, coy]);
  const sets = useMemo(() => {
    const pending = scoped.filter((l) => l.status === "Applied" || l.status === "Recommended");
    const current = scoped.filter((l) => isOnLeave(l, today) || isOverstayed(l, today) && diffDays(today, l.to_date) <= 60);
    const upcoming = scoped.filter((l) => l.status === "Approved" && l.from_date > today);
    return { pending, current, upcoming };
  }, [scoped, today]);

  const all = useMemo(() => {
    const term = q.trim().toLowerCase();
    return scoped.filter((l) => (!year || l.from_date.startsWith(year) || l.to_date.startsWith(year)) && (!status || l.status === status) &&
      (!term || soldierLabel(directoryById.get(l.soldier_id)).toLowerCase().includes(term)));
  }, [scoped, q, year, status, directoryById]);

  const due = useMemo(() => {
    if (!perms.canSeeLeaveDue) return [];
    const ids = directory.filter((d) => d.status === "Serving" && perms.canViewCompany(d.company_id) && (!coy || d.company_id === coy)).map((d) => d.id);
    return leaveDue(leave, ids, today);
  }, [perms, directory, coy, leave, today]);
  // "No leave record" is listed only when asked for (no history entered yet)
  const dueShown = due.filter((d) => (dueLevel ? d.level === dueLevel : d.level !== "none"));
  const crossed = due.filter((d) => d.level === "crossed").length;
  const dueOnly = due.filter((d) => d.level === "due").length;

  const rows = tab === "pending" ? sets.pending : tab === "current" ? sets.current : tab === "upcoming" ? sets.upcoming : all;
  const overstayed = sets.current.filter((l) => isOverstayed(l, today));

  const registerRows = () => rows.map((l, i) => {
    const s = directoryById.get(l.soldier_id);
    return { Ser: i + 1, "Personal No": s?.snk_no ?? "", Rank: s?.rank ?? "", Name: s?.name ?? "", Coy: companyById.get(l.company_id ?? "")?.short_name ?? "", Type: leaveTypes.find((t) => t.id === l.leave_type_id)?.name ?? "", From: l.from_date, To: l.to_date, Days: l.days, Status: l.status, Rejoined: l.rejoin_date ?? "", Reason: l.reason ?? "", Address: l.leave_address ?? "", Contact: l.contact_no ?? "" };
  });
  async function exportAll() {
    await exportXlsx(`Leave_Register_${today}`, [{ name: "Leave", rows: registerRows() }]);
  }
  async function exportPdf() {
    await exportObjectsPdf({
      filename: `Leave_Register_${today}`, unit: settings.unit.name, title: "Leave Register", orientation: "landscape",
      subtitle: ({ pending: "Pending action", current: "On leave now", upcoming: "Upcoming leave", due: "Leave due", all: "All leave" } as Record<string, string>)[tab] ?? "",
      chips: [{ label: "Entries", value: String(rows.length), color: "#1f8aa3" }, { label: "Days", value: String(rows.reduce((n, l) => n + (l.days ?? 0), 0)), color: "#4f6f52" }],
      rows: registerRows().map((r) => ({ ...r, From: fmtDateFull(r.From), To: fmtDateFull(r.To), Rejoined: r.Rejoined ? fmtDateFull(r.Rejoined) : "" })), skip: ["Address", "Contact"],
    });
  }

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Awaiting action" value={sets.pending.length} tone="amber" onClick={() => setTab("pending")} />
        <Stat label="On leave now" value={sets.current.filter((l) => isOnLeave(l, today)).length} tone="blue" onClick={() => setTab("current")} />
        <Stat label="Overstayed" value={overstayed.length} sub="rejoin not reported" tone="red" onClick={() => setTab("current")} />
        <Stat label="Due back in 3 days" value={sets.current.filter((l) => isOnLeave(l, today) && l.to_date <= addDays(today, 3)).length} tone="green" onClick={() => setTab("current")} />
        <Stat label="Starting soon" value={sets.upcoming.length} onClick={() => setTab("upcoming")} />
        {perms.canSeeLeaveDue && <Stat label="Leave due (2 m 15 d +)" value={dueOnly} tone="amber" onClick={() => { setTab("due"); setDueLevel("due"); }} />}
        {perms.canSeeLeaveDue && <Stat label="3 months crossed" value={crossed} tone="red" onClick={() => { setTab("due"); setDueLevel("crossed"); }} />}
      </div>
      {overstayed.length > 0 && <Alert tone="red">{overstayed.length} — <span>Due back but no rejoin reported. Mark them rejoined (with the actual date) or they keep showing absent in the parade state.</span></Alert>}
      <div className="row-between">
        <Tabs tabs={[{ key: "pending", label: "Pending action", count: sets.pending.length }, { key: "current", label: "On leave now", count: sets.current.length }, { key: "upcoming", label: "Upcoming", count: sets.upcoming.length }, ...(perms.canSeeLeaveDue ? [{ key: "due" as TabKey, label: "Leave due", count: dueOnly + crossed }] : []), { key: "all", label: "Leave register" }]} value={tab} onChange={setTab} />
      </div>
      <div className="toolbar">
        {perms.canViewAll && <CompanySelect value={coy} onChange={setCoy} />}
        {tab === "due" && <Select value={dueLevel} onChange={setDueLevel} placeholder="Due + crossed" options={[{ value: "due", label: "Leave due (2 m 15 d +)" }, { value: "crossed", label: "3 months crossed" }, { value: "none", label: "No leave record" }]} />}
        {tab === "all" && <>
          <div className="search"><Search size={15} /><input className="input" placeholder="Search soldier…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={year} onChange={setYear} placeholder="Any year" options={[0, 1, 2].map((d) => String(currentYear() - d))} />
          <Select value={status} onChange={setStatus} placeholder="Any status" options={["Applied", "Approved", "Rejected", "Cancelled"]} />
        </>}
        <span className="spacer" />
        {tab !== "due" && <button className="btn" onClick={exportAll} disabled={!rows.length}><Download size={15} /> Excel</button>}
        {tab !== "due" && <button className="btn" onClick={exportPdf} disabled={!rows.length}><FileText size={15} /> PDF</button>}
        {tab === "due" && <button className="btn" disabled={!dueShown.length} onClick={() => exportObjectsPdf({
          filename: `Leave_Due_${today}`, unit: settings.unit.name, title: "Leave due — every 3 months", subtitle: `As on ${fmtDateFull(today)} · suggested from 2 months 15 days, flagged after 3 months`,
          chips: [{ label: "Leave due", value: String(dueOnly), color: "#b36a1d" }, { label: "3 months crossed", value: String(crossed), color: "#c0392b" }],
          rows: dueShown.map((d) => { const s = directoryById.get(d.soldierId); return { "Personal No": s?.snk_no ?? "", Rank: s?.rank ?? "", Name: s?.name ?? "", Coy: companyById.get(s?.company_id ?? "")?.short_name ?? "", "Last leave ended": d.lastEnd ? fmtDateFull(d.lastEnd) : "No record", "Since": monthsDays(d.days), Tag: d.level === "crossed" ? "3 months crossed" : d.level === "none" ? "No leave record" : "Leave due", Planned: d.planned ? `${fmtDateFull(d.planned.from_date)} (${d.planned.status})` : "" }; }),
        })}><FileText size={15} /> PDF</button>}
      </div>
      {tab === "due" ? (
        <Card pad={false}>
          {dueShown.length === 0 ? <Empty>Nobody is due for leave.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Soldier</th><th>Coy</th><th>Last leave ended</th><th className="num">Since</th><th>Tag</th><th>Planned leave</th><th className="right" /></tr></thead>
              <tbody>{dueShown.map((d) => {
                const s = directoryById.get(d.soldierId);
                return (
                  <tr key={d.soldierId} className={d.level === "crossed" ? "row-highlight" : undefined}>
                    <td><div className="who"><Link className="link" href={`/soldiers/view?id=${d.soldierId}`}>{s ? `${s.rank} ${nameOf(s)}` : "—"}</Link><span>{s?.snk_no}</span></div></td>
                    <td>{companyById.get(s?.company_id ?? "")?.short_name}</td>
                    <td className="nowrap">{d.lastEnd ? fmtDate(d.lastEnd) : <span className="muted">{t("No leave record")}</span>}</td>
                    <td className="num nowrap strong">{monthsDays(d.days)}</td>
                    <td>{d.level === "crossed" ? <Badge tone="red">3 months crossed</Badge> : d.level === "none" ? <Badge tone="grey">No leave record</Badge> : <Badge tone="amber">Leave due</Badge>}</td>
                    <td className="small">{d.planned ? <>{fmtDate(d.planned.from_date)} <Badge tone={d.planned.status === "Approved" ? "green" : "blue"}>{d.planned.status}</Badge></> : <span className="muted">—</span>}</td>
                    <td className="right">{!d.planned && perms.canOperateCompany(s?.company_id) && <button className="btn btn-xs btn-primary" onClick={() => setApplyFor(d.soldierId)}><Plus size={12} /> {t("Apply leave")}</button>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          <p className="small muted" style={{ padding: "8px 14px" }}>{t("Every soldier should go on leave every 3 months. Suggested from 2 months 15 days after his last leave ended; flagged red after 3 months.")} ({LEAVE_CROSSED_DAYS} {t("days")})</p>
        </Card>
      ) : <Card pad={false}>{rows.length === 0 ? <Empty>Nothing here.</Empty> : <LeaveTable rows={rows} reload={reload} />}</Card>}
      {applyFor && <ApplyModal existing={leave} soldier={applyFor} onClose={() => setApplyFor(null)} onDone={() => { setApplyFor(null); reload(); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ table
function LeaveTable({ rows, reload, hideSoldier }: { rows: LeaveApplication[]; reload: () => void; hideSoldier?: boolean }) {
  const { perms, directoryById, leaveTypes, companyById, profile } = useSession();
  const { nameOf } = useI18n();
  const today = bdToday();
  const { busy, run } = useAction();
  const [act, setAct] = useState<{ l: LeaveApplication; action: "recommend" | "approve" | "reject" | "cancel" | "rejoin" } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [rejoin, setRejoin] = useState(today);
  const [detail, setDetail] = useState<LeaveApplication | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkRejoin, setBulkRejoin] = useState<"due" | "today" | null>(null);
  const canRejoin = (l: LeaveApplication) => l.status === "Approved" && !l.rejoin_date && l.from_date <= today && perms.canOperateCompany(l.company_id);
  const rejoinable = rows.filter(canRejoin);
  const chosen = rejoinable.filter((l) => sel.has(l.id));
  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function doBulkRejoin() {
    await run(async () => {
      for (const l of chosen) await leaveAction(l.id, "rejoin", null, bulkRejoin === "today" ? today : (l.to_date < today ? addDays(l.to_date, 1) : today));
      setSel(new Set()); setBulkRejoin(null); reload();
    }, `${chosen.length} rejoin(s) recorded`);
  }

  async function doAction() {
    if (!act) return;
    await run(async () => { await leaveAction(act.l.id, act.action, remarks || null, act.action === "rejoin" ? rejoin : null); setAct(null); setRemarks(""); reload(); },
      { recommend: "Recommended", approve: "Leave approved", reject: "Leave rejected", cancel: "Leave cancelled", rejoin: "Rejoin recorded" }[act.action]);
  }
  const statusOf = (l: LeaveApplication) => (isOnLeave(l, today) ? (isOverstayed(l, today) ? "Overstayed" : "On leave") : isOverstayed(l, today) ? "Overstayed" : l.status === "Approved" && l.rejoin_date ? "Rejoined" : l.status);

  return (
    <>
      {rejoinable.length > 1 && (
        <div className={chosen.length ? "bulk-bar on" : "bulk-bar"} style={{ margin: 10 }}>
          <label className="check"><input type="checkbox" checked={chosen.length === rejoinable.length} onChange={() => setSel(chosen.length === rejoinable.length ? new Set() : new Set(rejoinable.map((l) => l.id)))} /> Select all who can rejoin ({rejoinable.length})</label>
          {chosen.length > 0 && <>
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => setBulkRejoin("due")}><CornerDownLeft size={13} /> Mark {chosen.length} rejoined</button>
          </>}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{rejoinable.length > 1 && <th style={{ width: 28 }} />}{!hideSoldier && <th>Soldier</th>}<th>Type</th><th>From</th><th>To</th><th className="num">Days</th><th>Status</th><th>Workflow</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map((l) => {
              const s = directoryById.get(l.soldier_id);
              const st = statusOf(l);
              const own = l.soldier_id === profile.soldier_id;
              return (
                <tr key={l.id} className={cls(st === "Overstayed" && "row-highlight", sel.has(l.id) && "row-selected")}>
                  {rejoinable.length > 1 && <td>{canRejoin(l) && <input type="checkbox" aria-label="Select" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />}</td>}
                  {!hideSoldier && <td><div className="who"><Link className="link" href={`/soldiers/view?id=${l.soldier_id}`}>{s ? `${s.rank} ${nameOf(s)}` : "—"}</Link><span>{s?.snk_no} · {companyById.get(l.company_id ?? "")?.short_name}</span></div></td>}
                  <td>{leaveTypes.find((t) => t.id === l.leave_type_id)?.code}</td>
                  <td className="nowrap">{fmtDate(l.from_date)}</td>
                  <td className="nowrap">{fmtDate(l.to_date)}{l.rejoin_date && <div className="small muted"><span>rejoined</span> {fmtDate(l.rejoin_date)}</div>}</td>
                  <td className="num">{l.days}</td>
                  <td><Badge tone={st === "Overstayed" ? "red" : st === "On leave" ? "blue" : st === "Rejoined" ? "grey" : LEAVE_STATUS_TONE[l.status]}>{st}</Badge></td>
                  <td className="small muted nowrap">{l.status === "Applied" || l.status === "Recommended" ? "Waiting for Coy Comd" : l.decided_at ? `${l.status} ${fmtDate(l.decided_at.slice(0, 10), false)}` : "—"}</td>
                  <td className="right nowrap">
                    <button className="btn btn-xs btn-ghost" onClick={() => setDetail(l)}>Details</button>
                    {["Applied", "Recommended"].includes(l.status) && perms.canDecideLeave(l.company_id, l.soldier_id) && <>
                      <button className="btn btn-xs btn-green" onClick={() => setAct({ l, action: "approve" })}><Check size={12} /> Approve</button>
                      <button className="btn btn-xs btn-red" onClick={() => setAct({ l, action: "reject" })}><X size={12} /></button>
                    </>}
                    {l.status === "Approved" && !l.rejoin_date && l.from_date <= today && perms.canOperateCompany(l.company_id) && <button className="btn btn-xs btn-primary" onClick={() => { setRejoin(l.to_date < today ? addDays(l.to_date, 1) : today); setAct({ l, action: "rejoin" }); }}><CornerDownLeft size={12} /> Rejoin</button>}
                    {["Applied", "Recommended"].includes(l.status) && (own || perms.canOperateCompany(l.company_id)) && !perms.canDecideLeave(l.company_id, l.soldier_id) && <button className="btn btn-xs btn-ghost" onClick={() => setAct({ l, action: "cancel" })}>Cancel</button>}
                    {l.status === "Approved" && perms.canDecideLeave(l.company_id, l.soldier_id) && !l.rejoin_date && l.from_date > today && <button className="btn btn-xs btn-ghost" onClick={() => setAct({ l, action: "cancel" })}>Cancel</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!act} onClose={() => setAct(null)} title={act ? { recommend: "Recommend leave", approve: "Approve leave", reject: "Reject leave", cancel: "Cancel leave", rejoin: "Report rejoin" }[act.action] : ""}
        footer={<><button className="btn" onClick={() => setAct(null)}>Close</button><button className={act?.action === "reject" || act?.action === "cancel" ? "btn btn-red" : "btn btn-primary"} disabled={busy} onClick={doAction}>Confirm</button></>}>
        {act && <>
          <p style={{ marginTop: 0 }}><strong>{soldierLabel(directoryById.get(act.l.soldier_id))}</strong><br />{leaveTypes.find((t) => t.id === act.l.leave_type_id)?.name}: {fmtDate(act.l.from_date)} – {fmtDate(act.l.to_date)} ({act.l.days} days)</p>
          {act.action === "rejoin" && <Field label="Date rejoined" hint={`Leave ended ${fmtDate(act.l.to_date)}. ${rejoin > addDays(act.l.to_date, 1) ? `Overstay of ${diffDays(rejoin, act.l.to_date) - 1} day(s).` : ""}`}><input className="input" type="date" value={rejoin} min={act.l.from_date} onChange={(e) => setRejoin(e.target.value)} /></Field>}
          {act.action !== "rejoin" && <Field label="Remarks"><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={act.action === "reject" ? "Reason for rejection" : "Optional"} /></Field>}
        </>}
      </Modal>

      <Modal open={!!bulkRejoin} onClose={() => setBulkRejoin(null)} title={`Report rejoin — ${chosen.length} soldier(s)`}
        footer={<><button className="btn" onClick={() => setBulkRejoin(null)}>Close</button><button className="btn btn-primary" disabled={busy || !chosen.length} onClick={doBulkRejoin}>Confirm</button></>}>
        <div className="stack">
          <label className="check"><input type="radio" checked={bulkRejoin === "due"} onChange={() => setBulkRejoin("due")} /> Each rejoined on time (the day after his leave ended)</label>
          <label className="check"><input type="radio" checked={bulkRejoin === "today"} onChange={() => setBulkRejoin("today")} /> All rejoined today ({fmtDate(today)})</label>
          <p className="small muted">{chosen.map((l) => soldierLabel(directoryById.get(l.soldier_id))).join(", ")}</p>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Leave application">
        {detail && <div>
          {[["Soldier", soldierLabel(directoryById.get(detail.soldier_id))], ["Leave type", leaveTypes.find((t) => t.id === detail.leave_type_id)?.name], ["Period", `${fmtDate(detail.from_date)} – ${fmtDate(detail.to_date)} (${detail.days} days)`], ["Actual last day", fmtDate(leaveEnd(detail))], ["Reason", detail.reason], ["Leave address", detail.leave_address], ["Contact", detail.contact_no], ["Applied", fmtDateTime(detail.applied_at)], [detail.status === "Rejected" ? "Rejected" : detail.status === "Cancelled" ? "Cancelled" : "Approved", detail.decided_at ? `${fmtDateTime(detail.decided_at)} ${detail.decision_remarks ? "— " + detail.decision_remarks : ""}` : "—"], ["Rejoined", fmtDate(detail.rejoin_date)]].map(([k, v]) => (
            <div className="kv" key={k as string}><span className="muted">{k}</span><span style={{ textAlign: "right" }}>{v || "—"}</span></div>
          ))}
        </div>}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ apply
function ApplyModal({ existing, onClose, onDone, soldier }: { existing: LeaveApplication[]; onClose: () => void; onDone: () => void; soldier?: string }) {
  const { perms, profile, leaveTypes, directoryById } = useSession();
  const today = bdToday();
  const [soldierId, setSoldierId] = useState<string | null>(perms.isSoldier ? profile.soldier_id : soldier ?? null);
  const [typeId, setTypeId] = useState(leaveTypes.find((t) => t.code === "PL")?.id ?? leaveTypes[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 15));
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const { busy, run } = useAction();
  const days = to >= from ? diffDays(to, from) + 1 : 0;

  const { data: history } = useAsync(async () => (soldierId && !perms.isSoldier ? listLeave({ soldierId }) : existing), [soldierId]);
  const year = Number(from.slice(0, 4));
  const bal = leaveBalance(history ?? [], leaveTypes, year).find((b) => b.type.id === typeId);
  const over = bal && bal.remaining !== null && days > bal.remaining - bal.pending;
  const editableSoldier = soldierId ? perms.isSoldier || soldierId === profile.soldier_id || perms.canOperateCompany(directoryById.get(soldierId)?.company_id) : false;

  async function submit() {
    if (!soldierId) return;
    await run(async () => {
      await applyLeave({ soldier_id: soldierId, leave_type_id: typeId, from_date: from, to_date: to, reason: reason || null, leave_address: address || null, contact_no: contact || null });
      onDone();
    }, "Leave application submitted");
  }

  return (
    <Modal open onClose={onClose} title={perms.isSoldier ? "Apply for leave" : "New leave application"}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !soldierId || !typeId || days <= 0 || !editableSoldier} onClick={submit}>Submit application</button></>}>
      <div className="form-grid">
        {!perms.isSoldier && <Field label="Soldier" wide required><SoldierPicker value={soldierId} onChange={(id) => setSoldierId(id)} filter={(s) => perms.canOperateCompany(s.company_id) || s.id === profile.soldier_id} autoFocus /></Field>}
        <Field label="Leave type" required><Select value={typeId} onChange={setTypeId} options={leaveTypes.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Days"><input className="input" value={days > 0 ? `${days} day(s)` : "Check dates"} disabled /></Field>
        <Field label="From" required><input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></Field>
        <Field label="To" required><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Reason" wide><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Leave address" wide><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address while on leave" /></Field>
        <Field label="Contact No on leave"><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
      </div>
      {bal && soldierId && (
        <div className={`alert ${over ? "alert-amber" : "alert-blue"}`} style={{ marginTop: 14, marginBottom: 0 }}>
          <div>{bal.type.name} {year}: {bal.quota === null ? "no annual limit" : <>entitled <strong>{bal.quota}</strong>, availed <strong>{bal.used}</strong>, pending <strong>{bal.pending}</strong>, balance <strong>{bal.remaining}</strong>.</>}
            {over && <> This application exceeds the balance — the approving officer will see it.</>}</div>
        </div>
      )}
    </Modal>
  );
}
