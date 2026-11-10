"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Badge, Card, CompanySelect, Empty, ErrorBox, Loading, PageHeader, Stat, useAsync } from "@/components/ui";
import { listParadeEntries, listParadeStates } from "@/lib/api";
import { summarizeParade, type ParadeSummary } from "@/lib/compute";
import { exportXlsx } from "@/lib/excel";
import { exportObjectsPdf } from "@/lib/pdf";
import { useSession } from "@/lib/session";
import { addDays, bdToday, fmtDate, strengthLabel, strengthTotal, fmtDateFull } from "@/lib/utils";

export default function ParadeHistoryPage() {
  const { perms, directoryById, settings, companyById } = useSession();
  const today = bdToday();
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);
  const [coy, setCoy] = useState("");

  const { data, error, loading, reload } = useAsync(async () => {
    const states = await listParadeStates(from, to);
    const entries = await listParadeEntries(states.map((s) => s.id));
    return { states, entries };
  }, [from, to]);

  const rows = useMemo(() => {
    if (!data) return [];
    const byState = new Map<string, typeof data.entries>();
    for (const e of data.entries) {
      if (!perms.canViewCompany(e.company_id) || (coy && e.company_id !== coy)) continue;
      (byState.get(e.parade_state_id) ?? byState.set(e.parade_state_id, []).get(e.parade_state_id)!).push(e);
    }
    return data.states.map((st) => ({ st, sum: summarizeParade(byState.get(st.id) ?? [], directoryById).total }));
  }, [data, perms, coy, directoryById]);

  const reasons = settings.absent_reasons;
  const first = rows.filter((r) => (r.st.kind === "Morning" || r.st.state_type === "Morning State"));
  const avg = (fn: (s: ParadeSummary) => number) => (first.length ? Math.round(first.reduce((n, r) => n + fn(r.sum), 0) / first.length) : 0);
  const maxPosted = Math.max(1, ...first.map((r) => strengthTotal(r.sum.posted)));

  const summaryRows = () => rows.map((r) => ({
        Date: r.st.date, State: r.st.state_type, Status: r.st.status, Posted: strengthLabel(r.sum.posted), Present: strengthLabel(r.sum.present), Absent: strengthLabel(r.sum.absent),
        ...Object.fromEntries(reasons.map((x) => [x, r.sum.absentBy[x] ? strengthLabel(r.sum.absentBy[x]) : ""])),
        Employed: strengthLabel(r.sum.employed), "On Parade": strengthLabel(r.sum.onParade), "Present %": strengthTotal(r.sum.posted) ? Math.round((strengthTotal(r.sum.present) / strengthTotal(r.sum.posted)) * 100) : 0,
      }));
  async function exportRange() {
    await exportXlsx(`Parade_State_${from}_to_${to}`, [{ name: "Summary", rows: summaryRows() }]);
  }
  async function exportPdf() {
    await exportObjectsPdf({
      filename: `Parade_State_${from}_to_${to}`, unit: settings.unit.name, title: "Parade State — History", orientation: "landscape",
      subtitle: `${fmtDate(from)} to ${fmtDate(to)}${coy ? ` · ${companyById.get(coy)?.name}` : ""} · strength shown as Offr+JCO+OR`,
      chips: [{ label: "States", value: String(rows.length), color: "#1c3d57" }],
      rows: summaryRows().map((r) => ({ ...r, Date: fmtDateFull(r.Date) })),
    });
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Parade State" title="History & Reports" subtitle={`All parade states from ${fmtDate(from)} to ${fmtDate(to)}${coy ? ` · ${companyById.get(coy)?.name}` : ""}`}
        actions={<>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <input className="input" type="date" value={to} min={from} max={addDays(today, 1)} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          {perms.canViewAll && <CompanySelect value={coy} onChange={setCoy} />}
          <button className="btn" onClick={exportRange} disabled={!rows.length}><Download size={15} /> Excel</button>
          <button className="btn" onClick={exportPdf} disabled={!rows.length}><FileText size={15} /> PDF</button>
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : rows.length === 0 ? <Card><Empty>No parade states in this period.</Empty></Card> : (
        <>
          <div className="stats">
            <Stat label="States in period" value={rows.length} sub={`${first.length} days`} tone="navy" />
            <Stat label="Avg posted" value={avg((s) => strengthTotal(s.posted))} />
            <Stat label="Avg present" value={avg((s) => strengthTotal(s.present))} tone="green" />
            <Stat label="Avg on leave" value={avg((s) => strengthTotal(s.absentBy.Leave ?? { Offr: 0, JCO: 0, OR: 0 }))} tone="blue" />
            <Stat label="Avg on parade" value={avg((s) => strengthTotal(s.onParade))} tone="amber" />
          </div>
          <Card title="Daily strength (Morning State)" className="mb">
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 150, overflowX: "auto", paddingBottom: 4 }}>
              {[...first].reverse().map((r) => {
                const h = (n: number) => `${(n / maxPosted) * 120}px`;
                return (
                  <Link key={r.st.id} href={`/parade-state/report?id=${r.st.id}`} title={`${fmtDate(r.st.date)}: present ${strengthTotal(r.sum.present)}, absent ${strengthTotal(r.sum.absent)}`} style={{ display: "grid", justifyItems: "center", gap: 4, minWidth: 34 }}>
                    <div style={{ display: "flex", flexDirection: "column-reverse", width: 22, borderRadius: 4, overflow: "hidden" }}>
                      <i className="bar-amber" style={{ height: h(strengthTotal(r.sum.onParade)) }} />
                      <i className="bar-blue" style={{ height: h(strengthTotal(r.sum.employed)) }} />
                      <i className="bar-red" style={{ height: h(strengthTotal(r.sum.absent)) }} />
                    </div>
                    <span className="small muted">{r.st.date.slice(8)}</span>
                  </Link>
                );
              })}
            </div>
            <div className="legend"><span><i className="bar-amber" />On parade</span><span><i className="bar-blue" />Employed</span><span><i className="bar-red" />Absent</span></div>
          </Card>
          <Card pad={false}>
            <div className="table-wrap tall">
              <table className="table compact nowrap-cells">
                <thead><tr><th>Date</th><th>State</th><th className="num">Posted</th>{reasons.map((r) => <th key={r} className="num">{r}</th>)}<th className="num">Absent</th><th className="num">Present</th><th className="num">Employed</th><th className="num">On Parade</th><th /></tr></thead>
                <tbody>{rows.map(({ st, sum }) => (
                  <tr key={st.id}>
                    <td className="strong">{fmtDate(st.date)}</td>
                    <td>{st.state_type} {st.status === "Open" && <Badge tone="amber">Open</Badge>}</td>
                    <td className="num mono">{strengthLabel(sum.posted)}</td>
                    {reasons.map((r) => <td key={r} className="num mono">{sum.absentBy[r] ? strengthLabel(sum.absentBy[r]) : <span className="muted">–</span>}</td>)}
                    <td className="num mono strong">{strengthLabel(sum.absent)}</td>
                    <td className="num mono">{strengthLabel(sum.present)}</td>
                    <td className="num mono">{strengthLabel(sum.employed)}</td>
                    <td className="num mono">{strengthLabel(sum.onParade)}</td>
                    <td><Link className="btn btn-xs" href={`/parade-state/report?id=${st.id}`}><FileText size={12} /> Report</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
