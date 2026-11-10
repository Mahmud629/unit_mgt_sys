"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, useAction, useAsync } from "@/components/ui";
import { exportParadeStatePdf } from "@/lib/reports";
import { getParadeState, listParadeEntries, listSubmissions } from "@/lib/api";
import { summarizeParade } from "@/lib/compute";
import { exportXlsx } from "@/lib/excel";
import { useSession } from "@/lib/session";
import type { ParadeEntry } from "@/lib/types";
import { fmtDate, fmtDateLong, fmtDateTime, groupBy, sortSoldiers, strengthLabel, zeroStrength } from "@/lib/utils";

export default function ParadeReportPage() {
  const id = useSearchParams().get("id");
  const session = useSession();
  const { perms, myCompanies, directoryById, companyById, settings } = session;
  const { run } = useAction();
  const { data, error, loading } = useAsync(async () => {
    if (!id) return null;
    const st = await getParadeState(id);
    if (!st) throw new Error("Parade state not found");
    const [entries, subs] = await Promise.all([listParadeEntries(id), listSubmissions(id)]);
    return { st, entries: entries.filter((e) => perms.canViewCompany(e.company_id)), subs };
  }, [id]);

  const view = useMemo(() => {
    if (!data) return null;
    const { byCompany, total } = summarizeParade(data.entries, directoryById);
    const reasons = [...new Set([...settings.absent_reasons, ...Object.keys(total.absentBy)])].filter((r) => total.absentBy[r]);
    const emps = Object.keys(total.employedBy).sort();
    const enrich = (list: typeof data.entries) => sortSoldiers(list.map((e) => ({ e, s: directoryById.get(e.soldier_id), category: directoryById.get(e.soldier_id)?.category, display_order: directoryById.get(e.soldier_id)?.display_order, snk_no: directoryById.get(e.soldier_id)?.snk_no })));
    const absentees = groupBy(enrich(data.entries.filter((e) => e.state === "Absent")), (x) => x.e.absent_reason ?? "Other");
    const employed = groupBy(enrich(data.entries.filter((e) => e.state === "Present" && e.employment)), (x) => x.e.employment!);
    const empty = summarizeParade([], directoryById).total;
    return { byCompany, total, reasons, emps, absentees, employed, empty };
  }, [data, directoryById, settings]);

  if (!id) return <div className="page"><Empty>No state selected.</Empty></div>;
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!data || !view) return null;
  const { st } = data;
  // every active company is listed; one with nobody posted shows dashes
  const coys = myCompanies.filter((c) => view.byCompany.has(c.id) || c.active !== false);
  const sumOf = (id: string) => view.byCompany.get(id) ?? view.empty;
  const cell = (s?: { Offr: number; JCO: number; OR: number }) => (s && s.Offr + s.JCO + s.OR ? strengthLabel(s) : "–");
  const lbl = (id: string) => (view.byCompany.has(id) ? strengthLabel : cell);

  async function exportReport() {
    const matrix = [...coys.map((c) => ({ c: c.name, s: sumOf(c.id), f: lbl(c.id) })), { c: "TOTAL", s: view!.total, f: strengthLabel }].map(({ c, s, f }) => ({
      Coy: c, Posted: f(s.posted), ...Object.fromEntries(view!.reasons.map((r) => [r, cell(s.absentBy[r])])), "Total Absent": f(s.absent), Present: f(s.present), Employed: f(s.employed), "On Parade": f(s.onParade),
    }));
    const roll = (groups: Record<string, Array<{ e: ParadeEntry; s?: { snk_no: string; rank: string; name: string } }>>, label: string) =>
      Object.entries(groups).flatMap(([k, list]) => list.map(({ e, s }, i) => ({ [label]: k, Ser: i + 1, "Personal No": s?.snk_no ?? "", Rank: s?.rank ?? "", Name: s?.name ?? "", Coy: companyById.get(e.company_id)?.short_name ?? "", Location: e.location ?? "", Remarks: e.remarks ?? e.auto_note ?? "" })));
    await exportXlsx(`Parade_State_${st.date}_${st.state_type.replace(/\s+/g, "")}`, [
      { name: "State", rows: matrix },
      { name: "Absentees", rows: roll(view!.absentees, "Reason") },
      { name: "Employed", rows: roll(view!.employed, "Employment") },
    ]);
  }

  return (
    <div className="page">
      <div className="no-print" style={{ marginBottom: 12 }}><Link href="/parade-state/history" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> History</Link></div>
      <PageHeader eyebrow="Parade State Report" title={`${st.state_type} — ${fmtDate(st.date)}`} subtitle={<>{fmtDateLong(st.date)} · <Badge tone={st.status === "Finalized" ? "green" : "amber"}>{st.status}</Badge> {st.finalized_at && `at ${fmtDateTime(st.finalized_at)}`}</>}
        actions={<><button className="btn" onClick={exportReport}><Download size={15} /> Excel</button><button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button><button className="btn btn-primary" onClick={() => run(() => exportParadeStatePdf(session, st.id), "PDF downloaded")}><FileText size={15} /> PDF</button></>} />
      <div className="print-only report-title">
        <img src="/brand/logo-pdf.jpg" alt="" style={{ width: 54, height: 54, objectFit: "contain" }} />
        <h2>{settings.unit.name} — {st.state_type}</h2>
        <p>{fmtDateLong(st.date)} · Status: {st.status} · Figures as Offr+JCO+OR</p>
      </div>

      <Card title="Company-wise state (Offr+JCO+OR)" pad={false} className="mb">
        <div className="table-wrap">
          <table className="table compact bordered nowrap-cells">
            <thead><tr><th>Coy</th><th className="num">Posted</th>{view.reasons.map((r) => <th key={r} className="num">{r}</th>)}<th className="num">Total Absent</th><th className="num">Present</th><th className="num">Employed</th><th className="num">On Parade</th><th className="no-print">Submission</th></tr></thead>
            <tbody>{coys.map((c) => {
              const s = sumOf(c.id), f = lbl(c.id);
              const sub = data.subs.find((x) => x.company_id === c.id);
              return (
                <tr key={c.id}>
                  <td className="strong">{c.name}</td><td className="num mono">{f(s.posted)}</td>
                  {view.reasons.map((r) => <td key={r} className="num mono">{cell(s.absentBy[r])}</td>)}
                  <td className="num mono strong">{f(s.absent)}</td><td className="num mono">{f(s.present)}</td><td className="num mono">{f(s.employed)}</td><td className="num mono strong">{f(s.onParade)}</td>
                  <td className="no-print"><Badge tone={sub?.status === "Accepted" ? "green" : sub?.status === "Submitted" ? "blue" : "grey"}>{sub?.status ?? "—"}</Badge></td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><td>TOTAL</td><td className="num mono">{strengthLabel(view.total.posted)}</td>{view.reasons.map((r) => <td key={r} className="num mono">{cell(view.total.absentBy[r])}</td>)}<td className="num mono">{strengthLabel(view.total.absent)}</td><td className="num mono">{strengthLabel(view.total.present)}</td><td className="num mono">{strengthLabel(view.total.employed)}</td><td className="num mono">{strengthLabel(view.total.onParade)}</td><td className="no-print" /></tr></tfoot>
          </table>
        </div>
      </Card>

      {view.emps.length > 0 && (
        <Card title="Employment breakdown" pad={false} className="mb">
          <div className="table-wrap"><table className="table compact bordered nowrap-cells">
            <thead><tr><th>Coy</th>{view.emps.map((x) => <th key={x} className="num">{x}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>{coys.map((c) => { const s = sumOf(c.id); return <tr key={c.id}><td className="strong">{c.short_name}</td>{view.emps.map((x) => <td key={x} className="num mono">{cell(s.employedBy[x])}</td>)}<td className="num mono strong">{lbl(c.id)(s.employed)}</td></tr>; })}</tbody>
            <tfoot><tr><td>TOTAL</td>{view.emps.map((x) => <td key={x} className="num mono">{cell(view.total.employedBy[x])}</td>)}<td className="num mono">{strengthLabel(view.total.employed)}</td></tr></tfoot>
          </table></div>
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Nominal roll — absentees" pad={false}>
          {Object.keys(view.absentees).length === 0 ? <Empty>No absentees</Empty> : Object.entries(view.absentees).map(([reason, list]) => (
            <div key={reason}>
              <div style={{ padding: "8px 14px", background: "var(--panel-2)", fontWeight: 700, fontSize: 12.5 }}>{reason} — {strengthLabel(list.reduce((s, x) => { s[(x.s?.category ?? "OR") as "OR"]++; return s; }, zeroStrength()))}</div>
              <table className="table compact"><tbody>{list.map(({ e, s }, i) => (
                <tr key={e.id}><td className="num muted" style={{ width: 30 }}>{i + 1}</td><td className="mono nowrap">{s?.snk_no}</td><td>{s?.rank} {s?.name}</td><td>{companyById.get(e.company_id)?.short_name}</td><td className="small">{[e.location, e.remarks ?? e.auto_note].filter(Boolean).join(" · ")}</td></tr>
              ))}</tbody></table>
            </div>
          ))}
        </Card>
        <Card title="Nominal roll — employed" pad={false}>
          {Object.keys(view.employed).length === 0 ? <Empty>Nobody employed</Empty> : Object.entries(view.employed).sort().map(([emp, list]) => (
            <div key={emp}>
              <div style={{ padding: "8px 14px", background: "var(--panel-2)", fontWeight: 700, fontSize: 12.5 }}>{emp} — {list.length}</div>
              <table className="table compact"><tbody>{list.map(({ e, s }, i) => (
                <tr key={e.id}><td className="num muted" style={{ width: 30 }}>{i + 1}</td><td className="mono nowrap">{s?.snk_no}</td><td>{s?.rank} {s?.name}</td><td>{companyById.get(e.company_id)?.short_name}</td><td className="small">{e.remarks ?? ""}</td></tr>
              ))}</tbody></table>
            </div>
          ))}
        </Card>
      </div>
      <div className="print-only" style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
        <div>Prepared by: ____________________</div><div>Adjutant: ____________________</div>
      </div>
    </div>
  );
}
