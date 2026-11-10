"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, Save, Search, Shuffle, Wand2 } from "lucide-react";
import { Alert, Badge, Card, Empty, ErrorBox, Loading, PageHeader, Select, useAction, useAsync } from "@/components/ui";
import { listCyclePlans, saveCyclePlans } from "@/lib/api";
import { CYCLE_ACTIVITIES, CYCLE_COLORS, CYCLE_SHORT, CYCLES, cycleOf } from "@/lib/constants";
import { exportXlsx } from "@/lib/excel";
import { useI18n } from "@/lib/i18n";
import { exportReportPdf } from "@/lib/pdf";
import { useSession } from "@/lib/session";
import type { CycleActivity } from "@/lib/types";
import { bdToday, cls, currentYear, sortSoldiers } from "@/lib/utils";

type Key = "c1" | "c2" | "c3" | "c4";
type Draft = Record<Key, CycleActivity | null> & { remarks: string | null };
const KEYS: Key[] = ["c1", "c2", "c3", "c4"];
const ACTS = CYCLE_ACTIVITIES as readonly CycleActivity[];
const rotation = (r: number): Record<Key, CycleActivity> => Object.fromEntries(KEYS.map((k, i) => [k, ACTS[(i + r) % 4]])) as Record<Key, CycleActivity>;

/** Problems in one soldier's year: an activity missing or done twice. */
function problems(d: Draft): string[] {
  const used = KEYS.map((k) => d[k]).filter(Boolean) as string[];
  const out: string[] = [];
  if (used.length < 4) out.push(`${4 - used.length} cycle(s) not planned`);
  const dup = used.filter((a, i) => used.indexOf(a) !== i);
  if (dup.length) out.push(`${[...new Set(dup)].join(", ")} twice`);
  return out;
}

export default function CyclePlanPage() {
  const { perms, myCompanies, directory, settings, companyById } = useSession();
  const { t, nameOf } = useI18n();
  const [year, setYear] = useState(currentYear());
  const [coy, setCoy] = useState(myCompanies[0]?.id ?? "");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { busy, run } = useAction();
  const editable = perms.canCommandCompany(coy);
  const nowCycle = year === currentYear() ? cycleOf(bdToday()) : 0;

  const { data, error, loading, reload } = useAsync(() => listCyclePlans(year), [year]);
  useEffect(() => { setDrafts({}); setSelected(new Set()); }, [year, coy, data]);

  const soldiers = useMemo(() => sortSoldiers(directory.filter((s) => s.status === "Serving" && s.company_id === coy && s.category !== "Offr" && (!cat || s.category === cat))), [directory, coy, cat]);
  const planBy = useMemo(() => new Map((data ?? []).map((p) => [p.soldier_id, p])), [data]);
  const current = (id: string): Draft => drafts[id] ?? (() => { const p = planBy.get(id); return { c1: p?.c1 ?? null, c2: p?.c2 ?? null, c3: p?.c3 ?? null, c4: p?.c4 ?? null, remarks: p?.remarks ?? null }; })();
  const shown = soldiers.filter((s) => !q || `${s.snk_no} ${s.rank} ${s.name} ${s.name_bn ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const dirty = Object.keys(drafts);

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...current(id), ...patch } }));
  const apply = (ids: string[], fn: (id: string, i: number) => Partial<Draft>) =>
    setDrafts((d) => { const next = { ...d }; ids.forEach((id, i) => { next[id] = { ...(d[id] ?? current(id)), ...fn(id, i) }; }); return next; });

  // summary: how many of the coy do each activity in each cycle
  const summary = useMemo(() => CYCLES.map((c) => {
    const k = c.key as Key;
    const counts = Object.fromEntries(ACTS.map((a) => [a, 0])) as Record<string, number>;
    let none = 0;
    for (const s of soldiers) { const a = current(s.id)[k]; if (a) counts[a]++; else none++; }
    return { c, counts, none };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [soldiers, drafts, planBy]);
  const withProblems = soldiers.filter((s) => problems(current(s.id)).length);

  async function save() {
    await run(async () => {
      await saveCyclePlans(dirty.map((id) => ({ soldier_id: id, year, company_id: coy, ...drafts[id] })));
      await reload();
    }, `${dirty.length} plan(s) saved`);
  }
  const rowsOut = () => soldiers.map((s) => { const d = current(s.id); return { "Personal No": s.snk_no, Rank: s.rank, Name: s.name, ...Object.fromEntries(CYCLES.map((c) => [`${c.label} (${c.months})`, d[c.key as Key] ?? ""])), Remarks: d.remarks ?? "" }; });
  const coyName = companyById.get(coy)?.name ?? "";

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((s) => selected.has(s.id));

  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Individual Cycle Plan"
        subtitle="Four cycles of three months. Each soldier does Indl Training, Group Training, Unit Admin and Privilege Leave once in the year — planned by the Coy Comd at the start of the year."
        actions={<>
          <button className="btn" onClick={() => exportXlsx(`Cycle_Plan_${year}_${coyName}`, [{ name: "Cycle plan", rows: rowsOut() }])}><Download size={15} /> Excel</button>
          <button className="btn" onClick={() => run(() => exportReportPdf({
            filename: `Cycle_Plan_${year}_${coyName}`, unit: settings.unit.name, title: `Individual Cycle Plan ${year} — ${coyName}`, orientation: "landscape",
            subtitle: CYCLES.map((c) => `${c.label}: ${c.months}`).join(" · "),
            chips: [...ACTS.map((a) => ({ label: a, value: summary.map((x) => x.counts[a]).join(" / "), color: CYCLE_COLORS[a] })), { label: "Not planned", value: String(withProblems.length), color: withProblems.length ? "#c0392b" : "#2e7d4f" }],
            sections: [{
              columns: [{ header: "Personal No", key: "no" }, { header: "Rank", key: "rank" }, { header: "Name", key: "name" }, ...CYCLES.map((c) => ({ header: `${c.label} ${c.months}`, key: c.key })), { header: "Remarks", key: "rmk" }],
              rows: soldiers.map((s) => { const d = current(s.id); return { no: s.snk_no, rank: s.rank, name: s.name, ...Object.fromEntries(KEYS.map((k) => [k, d[k] ?? ""])), rmk: d.remarks ?? "" }; }),
              colorize: (k, v) => (KEYS.includes(k as Key) ? CYCLE_COLORS[v] ?? null : null),
            }],
          }), "PDF downloaded")}><FileText size={15} /> PDF</button>
          {editable && <button className="btn btn-primary" disabled={busy || !dirty.length} onClick={save}><Save size={15} /> {t("Save")} {dirty.length > 0 && `(${dirty.length})`}</button>}
        </>} />

      <div className="toolbar">
        <Select value={String(year)} onChange={(v) => setYear(Number(v))} options={[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => ({ value: String(y), label: String(y) }))} />
        <Select value={coy} onChange={setCoy} options={myCompanies.map((c) => ({ value: c.id, label: c.name }))} />
        <Select value={cat} onChange={setCat} placeholder="JCO & OR" options={["JCO", "OR"]} />
        <div className="search grow"><Search size={15} /><input className="input" placeholder={t("Search name or Personal No…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="cycle-summary">
        {summary.map(({ c, counts, none }) => (
          <div key={c.key} className={cls("cycle-card", nowCycle === c.n && "now")}>
            <div className="cycle-card-head"><strong>{t(c.label)}</strong><span>{t(c.months)}</span>{nowCycle === c.n && <Badge tone="green">Now</Badge>}</div>
            <div className="stackbar">{ACTS.map((a) => counts[a] > 0 && <i key={a} style={{ flex: counts[a], background: CYCLE_COLORS[a] }} title={`${a}: ${counts[a]}`} />)}{none > 0 && <i style={{ flex: none, background: "var(--line)" }} />}</div>
            <ul>{ACTS.map((a) => <li key={a}><i style={{ background: CYCLE_COLORS[a] }} />{t(a)}<b>{counts[a]}</b></li>)}{none > 0 && <li className="muted"><i style={{ background: "var(--line)" }} />{t("Not planned")}<b>{none}</b></li>}</ul>
          </div>
        ))}
      </div>

      {withProblems.length > 0 && <Alert tone="amber"><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {withProblems.length} {t("soldier(s) need attention — every activity must be planned once in the year.")}</Alert>}

      {editable && (
        <div className="bulk-bar">
          <span>{selected.size ? <><strong>{selected.size}</strong> {t("selected")}</> : <span className="muted">{t("Tick soldiers to plan several at once")}</span>}</span>
          <button className="btn btn-sm" onClick={() => apply(shown.map((s) => s.id), (_, i) => rotation(i % 4))}><Wand2 size={13} /> {t("Auto-plan whole coy (balanced)")}</button>
          {selected.size > 0 && <>
            <span className="muted small">{t("Set selected to:")}</span>
            {[0, 1, 2, 3].map((r) => (
              <button key={r} className="btn btn-sm" title={KEYS.map((k) => rotation(r)[k]).join(" → ")} onClick={() => apply([...selected], () => rotation(r))}>
                <Shuffle size={12} /> {t("Pattern")} {String.fromCharCode(65 + r)}
              </button>
            ))}
            {CYCLES.map((c) => (
              <select key={c.key} className="input input-sm" value="" onChange={(e) => e.target.value && apply([...selected], () => ({ [c.key]: e.target.value as CycleActivity }))}>
                <option value="">{t(c.label)}…</option>{ACTS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
              </select>
            ))}
          </>}
        </div>
      )}

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <Card pad={false}>
          {shown.length === 0 ? <Empty>No soldiers.</Empty> : (
            <div className="table-wrap tall"><table className="table compact cycle-table">
              <thead><tr>
                {editable && <th style={{ width: 28 }}><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(shown.map((s) => s.id)))} /></th>}
                <th>{t("Personal No")}</th><th>{t("Rank & Name")}</th>
                {CYCLES.map((c) => <th key={c.key} className={cls(nowCycle === c.n && "now")}>{t(c.label)}<small>{t(c.months)}</small></th>)}
                <th>{t("Check")}</th><th>{t("Remarks")}</th>
              </tr></thead>
              <tbody>{shown.map((s) => {
                const d = current(s.id);
                const pr = problems(d);
                return (
                  <tr key={s.id} className={cls(drafts[s.id] && "row-dirty", selected.has(s.id) && "row-selected")}>
                    {editable && <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>}
                    <td className="mono">{s.snk_no}</td><td className="strong">{s.rank} {nameOf(s)}</td>
                    {KEYS.map((k, i) => {
                      const a = d[k];
                      return (
                        <td key={k} className={cls("cycle-cell", nowCycle === i + 1 && "now")}>
                          {editable ? (
                            <select className="cycle-select" style={a ? { background: CYCLE_COLORS[a], color: "#fff", borderColor: CYCLE_COLORS[a] } : undefined} value={a ?? ""} onChange={(e) => set(s.id, { [k]: (e.target.value || null) as CycleActivity | null })}>
                              <option value="">—</option>{ACTS.map((x) => <option key={x} value={x}>{t(CYCLE_SHORT[x])}</option>)}
                            </select>
                          ) : a ? <span className="cycle-chip" style={{ background: CYCLE_COLORS[a] }}>{t(CYCLE_SHORT[a])}</span> : <span className="muted">—</span>}
                        </td>
                      );
                    })}
                    <td>{pr.length ? <Badge tone="amber">{pr.join("; ")}</Badge> : <Badge tone="green">OK</Badge>}</td>
                    <td>{editable ? <input className="input input-sm" value={d.remarks ?? ""} onChange={(e) => set(s.id, { remarks: e.target.value || null })} /> : d.remarks}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      <div className="legend mt">{ACTS.map((a) => <span key={a}><i style={{ background: CYCLE_COLORS[a] }} />{t(a)} ({t(CYCLE_SHORT[a])})</span>)}</div>
    </div>
  );
}
