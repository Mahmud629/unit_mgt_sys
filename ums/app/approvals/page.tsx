"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Bus, UserCog, UserPlus, X } from "lucide-react";
import { ChangeSummary } from "@/components/soldier-profile";
import { Alert, Badge, Card, Empty, ErrorBox, Loading, PageHeader, Select, Tabs, useAction, useAsync } from "@/components/ui";
import { approveIdApplication, leaveAction, listChangeRequests, listIdApplications, listLeave, rejectIdApplication, reviewChangeRequest } from "@/lib/api";
import { RECORD_KINDS, SOLDIER_FIELD_GROUPS } from "@/lib/constants";
import type { IdApplication } from "@/lib/types";
import { leaveBalance } from "@/lib/compute";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { currentYear, errorMessage, fmtDate, fmtDateTime, heightLabel } from "@/lib/utils";

export default function ApprovalsPage() {
  const { perms, profile, directoryById, companyById, leaveTypes, companies, reload: reloadSession } = useSession();
  const { t, nameOf } = useI18n();
  const [tab, setTab] = useState<"leave" | "profile" | "newid" | "done">("leave");
  const [appCoy, setAppCoy] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const { data, error, loading, reload } = useAsync(async () => {
    const [leave, reqs, apps] = await Promise.all([listLeave(), listChangeRequests(), perms.isSuper ? listIdApplications() : Promise.resolve([] as IdApplication[])]);
    return { leave, reqs, apps };
  }, []);

  // own decisions first (Adjt: BHQ Pl & officers; Coy Comd: his coy), then other coys' leave the Adjt may decide in a Coy Comd's absence
  const pendingLeave = useMemo(() => (data?.leave ?? []).filter((l) => ["Applied", "Recommended"].includes(l.status) && perms.canDecideLeave(l.company_id, l.soldier_id))
    .sort((a, b) => Number(perms.isMyLeaveToDecide(b.company_id, b.soldier_id)) - Number(perms.isMyLeaveToDecide(a.company_id, a.soldier_id)) || a.applied_at.localeCompare(b.applied_at)), [data, perms]);
  const pendingReqs = useMemo(() => (data?.reqs ?? []).filter((r) => r.status === "Pending" && perms.canReviewProfile(r.company_id)), [data, perms]);
  const pendingApps = useMemo(() => (data?.apps ?? []).filter((a) => a.status === "Pending"), [data]);
  const done = useMemo(() => [
    ...(data?.apps ?? []).filter((a) => a.reviewed_at).map((a) => ({ kind: "newid" as const, at: a.reviewed_at!, a })),
    ...(data?.leave ?? []).filter((l) => l.decided_at && perms.canDecideLeave(l.company_id, l.soldier_id)).map((l) => ({ kind: "leave" as const, at: l.decided_at!, l })),
    ...(data?.reqs ?? []).filter((r) => r.reviewed_at && perms.canReviewProfile(r.company_id)).map((r) => ({ kind: "profile" as const, at: r.reviewed_at!, r })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60), [data, perms]);

  const who = (sid: string) => {
    const s = directoryById.get(sid);
    return s ? <Link className="link" href={`/soldiers/view?id=${sid}`}>{s.snk_no} {s.rank} {nameOf(s)}</Link> : "—";
  };

  if (!perms.canApproveAny) return <div className="page"><Alert tone="blue">{t("Approvals are done by the Coy Comd and by Adjt / 2IC / CO.")}</Alert></div>;

  return (
    <div className="page">
      <PageHeader eyebrow={perms.isCoyComd ? companyById.get(profile.company_id ?? "")?.name ?? t("Coy Comd") : t("Super admin")} title="Approvals" />
      <Tabs tabs={[
        { key: "leave", label: <><Bus size={14} /> {t("Leave")}</>, count: pendingLeave.length },
        { key: "profile", label: <><UserCog size={14} /> {t("Profile updates")}</>, count: pendingReqs.length },
        ...(perms.isSuper ? [{ key: "newid" as const, label: <><UserPlus size={14} /> {t("New ID")}</>, count: pendingApps.length }] : []),
        { key: "done", label: t("Decided") },
      ]} value={tab} onChange={(k) => { setTab(k); setSel(new Set()); }} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <div className="stack">
          {(tab === "leave" || tab === "profile") && (() => {
            const ids = (tab === "leave" ? pendingLeave : pendingReqs).map((x) => x.id);
            const chosen = ids.filter((id) => sel.has(id));
            if (ids.length < 2) return null;
            const allOn = chosen.length === ids.length;
            const act = (approve: boolean) => run(async () => {
              let done = 0; const fails: string[] = [];
              for (const id of chosen) {
                try {
                  if (tab === "leave") await leaveAction(id, approve ? "approve" : "reject", remarks[id] || null);
                  else await reviewChangeRequest(id, approve, remarks[id] || null);
                  done++;
                } catch (e) { fails.push(errorMessage(e)); }
              }
              setSel(new Set()); reload();
              if (fails.length) throw new Error(`${done} ${t("done")}, ${fails.length} ${t("not done")}: ${fails[0]}`);
            }, `${chosen.length} ${approve ? t("approved") : t("rejected")}`);
            return (
              <div className={chosen.length ? "bulk-bar on" : "bulk-bar"}>
                <label className="check"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(ids))} /> {t("Select all")} ({ids.length})</label>
                {chosen.length > 0 && <>
                  <strong>{chosen.length} {t("selected")}</strong>
                  <button className="btn btn-sm btn-green" disabled={busy} onClick={() => act(true)}><Check size={13} /> {t("Approve selected")}</button>
                  <button className="btn btn-sm btn-red" disabled={busy} onClick={() => act(false)}><X size={13} /> {t("Reject selected")}</button>
                </>}
              </div>
            );
          })()}
          {tab === "leave" && perms.isSuper && <Alert tone="blue">{t("Leave of BHQ Pl and of all officers is decided by the Adjt (2IC / CO). Other companies' leave is decided by their Coy Comd — you can still decide it when he is away.")}</Alert>}
          {tab === "leave" && (pendingLeave.length === 0 ? <Card><Empty>{t("No leave waiting for your approval.")}</Empty></Card> : pendingLeave.map((l) => {
            const type = leaveTypes.find((x) => x.id === l.leave_type_id);
            const bal = leaveBalance(data.leave.filter((x) => x.soldier_id === l.soldier_id), leaveTypes, currentYear()).find((b) => b.type.id === l.leave_type_id);
            return (
              <Card key={l.id} className={sel.has(l.id) ? "approval-card accent-leave selected" : "approval-card accent-leave"} title={<><input type="checkbox" className="card-check" aria-label="Select" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /> {who(l.soldier_id)} <Badge tone="blue">{companyById.get(l.company_id ?? "")?.short_name}</Badge> {!perms.isMyLeaveToDecide(l.company_id, l.soldier_id) && <Badge tone="grey">{t("Coy Comd's decision")}</Badge>}</>} actions={<span className="small muted">{t("Applied")} {fmtDateTime(l.applied_at)}</span>}>
                <div className="approval-grid">
                  <div><span className="muted small">{t("Leave type")}</span><strong>{type?.name}</strong></div>
                  <div><span className="muted small">{t("Period")}</span><strong>{fmtDate(l.from_date)} – {fmtDate(l.to_date)}</strong></div>
                  <div><span className="muted small">{t("Days")}</span><strong>{l.days}</strong></div>
                  <div><span className="muted small">{t("Balance")}</span><strong className={bal?.remaining !== null && bal && l.days > (bal.remaining ?? 0) ? "text-red" : undefined}>{bal?.remaining ?? "—"}</strong></div>
                </div>
                {l.reason && <p className="small" style={{ margin: "8px 0 0" }}><strong>{t("Reason")}:</strong> {l.reason}{l.leave_address ? ` · ${l.leave_address}` : ""}</p>}
                <div className="row mt">
                  <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder={t("Remarks (optional)")} value={remarks[l.id] ?? ""} onChange={(e) => setRemarks((m) => ({ ...m, [l.id]: e.target.value }))} />
                  <button className="btn btn-red" disabled={busy} onClick={() => run(async () => { await leaveAction(l.id, "reject", remarks[l.id] || null); reload(); }, t("Leave rejected"))}><X size={14} /> {t("Reject")}</button>
                  <button className="btn btn-green" disabled={busy} onClick={() => run(async () => { await leaveAction(l.id, "approve", remarks[l.id] || null); reload(); }, t("Leave approved"))}><Check size={14} /> {t("Approve")}</button>
                </div>
              </Card>
            );
          }))}

          {tab === "profile" && (pendingReqs.length === 0 ? <Card><Empty>{t("No profile updates waiting.")}</Empty></Card> : pendingReqs.map((r) => (
            <Card key={r.id} className={sel.has(r.id) ? "approval-card accent-profile selected" : "approval-card accent-profile"} title={<><input type="checkbox" className="card-check" aria-label="Select" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /> {who(r.soldier_id)} <Badge tone="blue">{companyById.get(r.company_id ?? "")?.short_name}</Badge></>} actions={<span className="small muted">{fmtDateTime(r.created_at)}</span>}>
              <ChangeSummary r={r} />
              {r.note && <p className="small" style={{ marginBottom: 0 }}><strong>{t("Note from soldier")}:</strong> {r.note}</p>}
              <div className="row mt">
                <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder={t("Remarks (optional)")} value={remarks[r.id] ?? ""} onChange={(e) => setRemarks((m) => ({ ...m, [r.id]: e.target.value }))} />
                <button className="btn btn-red" disabled={busy} onClick={() => run(async () => { await reviewChangeRequest(r.id, false, remarks[r.id] || null); reload(); }, t("Request rejected"))}><X size={14} /> {t("Reject")}</button>
                <button className="btn btn-green" disabled={busy} onClick={() => run(async () => { await reviewChangeRequest(r.id, true, remarks[r.id] || null); reload(); }, t("Approved — profile updated"))}><Check size={14} /> {t("Approve")}</button>
              </div>
            </Card>
          )))}

          {tab === "newid" && (pendingApps.length === 0 ? <Card><Empty>{t("No new ID applications waiting.")}</Empty></Card> : pendingApps.map((a) => (
            <Card key={a.id} className="approval-card accent-newid" title={<><span className="mono">{a.snk_no}</span> {a.rank} {a.name} <Badge tone="amber">{t("New ID")}</Badge></>} actions={<span className="small muted">{t("Applied")} {fmtDateTime(a.submitted_at)}</span>}>
              <ApplicationDetails a={a} />
              <div className="row mt">
                <Select value={appCoy[a.id] ?? a.company_id} onChange={(v) => setAppCoy((m) => ({ ...m, [a.id]: v }))} options={companies.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
                <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder={t("Remarks (optional)")} value={remarks[a.id] ?? ""} onChange={(e) => setRemarks((m) => ({ ...m, [a.id]: e.target.value }))} />
                <button className="btn btn-red" disabled={busy} onClick={() => run(async () => { await rejectIdApplication(a.id, remarks[a.id] || null); reload(); }, t("Application rejected"))}><X size={14} /> {t("Reject")}</button>
                <button className="btn btn-green" disabled={busy} onClick={() => run(async () => { const r = await approveIdApplication(a.id, appCoy[a.id] ?? a.company_id, remarks[a.id] || null); reload(); void reloadSession(["directory"]); return r; }, `${t("ID created — he can now sign in with Personal No")} ${a.snk_no}`)}><Check size={14} /> {t("Approve & create ID")}</button>
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>{t("Approving adds him to the soldiers database and opens his login with the password he chose.")}</p>
            </Card>
          )))}

          {tab === "done" && (done.length === 0 ? <Card><Empty>{t("Nothing decided yet.")}</Empty></Card> : (
            <Card pad={false}>
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>{t("When")}</th><th>{t("Type")}</th><th>{t("Soldier")}</th><th>{t("Details")}</th><th>{t("Decision")}</th></tr></thead>
                <tbody>{done.map((d) => d.kind === "newid" ? (
                  <tr key={d.a.id}><td className="nowrap">{fmtDateTime(d.at)}</td><td>{t("New ID")}</td><td>{d.a.soldier_id ? who(d.a.soldier_id) : `${d.a.snk_no} ${d.a.rank} ${d.a.name}`}</td><td className="small">{companyById.get(d.a.company_id)?.short_name}{d.a.review_remarks ? ` · ${d.a.review_remarks}` : ""}</td><td><Badge tone={d.a.status === "Approved" ? "green" : "red"}>{t(d.a.status)}</Badge></td></tr>
                ) : d.kind === "leave" ? (
                  <tr key={d.l.id}><td className="nowrap">{fmtDateTime(d.at)}</td><td>{t("Leave")}</td><td>{who(d.l.soldier_id)}</td><td className="small">{leaveTypes.find((x) => x.id === d.l.leave_type_id)?.code} {fmtDate(d.l.from_date)} – {fmtDate(d.l.to_date)}</td><td><Badge tone={d.l.status === "Approved" ? "green" : d.l.status === "Rejected" ? "red" : "grey"}>{t(d.l.status)}</Badge></td></tr>
                ) : (
                  <tr key={d.r.id}><td className="nowrap">{fmtDateTime(d.at)}</td><td>{t("Profile")}</td><td>{who(d.r.soldier_id)}</td><td className="small">{Object.keys(d.r.changes).length} {t("field(s)")}{d.r.record_ops.length ? ` · ${d.r.record_ops.length} ${t("record(s)")}` : ""}</td><td><Badge tone={d.r.status === "Approved" ? "green" : d.r.status === "Rejected" ? "red" : "grey"}>{t(d.r.status)}</Badge></td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationDetails({ a }: { a: IdApplication }) {
  const { t } = useI18n();
  const { companyById } = useSession();
  const all: Record<string, string> = { ...a.data, snk_no: a.snk_no, category: a.category, rank: a.rank, name: a.name, company_id: companyById.get(a.company_id)?.name ?? "" };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {SOLDIER_FIELD_GROUPS.map((g) => {
        const rows = g.fields.filter((f) => all[f.key]);
        if (!rows.length) return null;
        return (
          <div key={g.title}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{t(g.title)}</div>
            <dl className="dl">{rows.map((f) => <div key={f.key}><dt>{t(f.label)}</dt><dd>{f.type === "date" ? fmtDate(all[f.key]) : f.key === "height_in" ? `${heightLabel(Number(all[f.key]))} (${all[f.key]} in)` : all[f.key]}</dd></div>)}</dl>
          </div>
        );
      })}
      {a.records.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{t("Family & education")}</div>
          {a.records.map((r, i) => <div key={i} className="kv small"><span>{t(RECORD_KINDS[r.kind as "family"]?.title ?? r.kind)}</span><span>{Object.values(r.data).filter(Boolean).join(" · ")}</span></div>)}
        </div>
      )}
    </div>
  );
}
