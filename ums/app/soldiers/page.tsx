"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download, FileText, Filter, GraduationCap, Plus, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, useAction, useAsync } from "@/components/ui";
import { listSoldiers, saveCourse, saveDuty, saveSoldier } from "@/lib/api";
import { ACCOMMODATION, ALL_DISTRICTS, BLOOD_GROUPS, CATEGORIES, DIVISIONS, EDUCATION_LEVELS, MARITAL_STATUSES, MEDICAL_CATEGORIES, RELIGIONS, SOLDIER_STATUSES } from "@/lib/constants";
import { exportXlsx } from "@/lib/excel";
import { colorFor } from "@/lib/colors";
import { exportTablePdf, statusColour } from "@/lib/pdf";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { SOLDIER_COLUMNS, type Column } from "@/lib/soldier-columns";
import type { Soldier } from "@/lib/types";
import { addStrength, ageYears, bdToday, cls, heightLabel, serviceLeftYears, serviceYears, strengthLabel, zeroStrength } from "@/lib/utils";

interface Filters {
  q: string; company: string; category: string; rank: string; trade: string; status: string;
  ageMin: string; ageMax: string; svcMin: string; svcMax: string; leftMin: string; leftMax: string; htMin: string; htMax: string; ibMin: string; ibMax: string;
  division: string; district: string; blood: string; religion: string; marital: string; med: string; education: string; atts: string; living: string;
}
const EMPTY: Filters = { q: "", company: "", category: "", rank: "", trade: "", status: "Serving", ageMin: "", ageMax: "", svcMin: "", svcMax: "", leftMin: "", leftMax: "", htMin: "", htMax: "", ibMin: "", ibMax: "", division: "", district: "", blood: "", religion: "", marital: "", med: "", education: "", atts: "", living: "" };
const FILTER_LABEL: Record<keyof Filters, string> = { q: "Search", company: "Coy", category: "Category", rank: "Rank", trade: "Trade", status: "Status", ageMin: "Age ≥", ageMax: "Age ≤", svcMin: "Svc ≥", svcMax: "Svc ≤", leftMin: "Svc left ≥", leftMax: "Svc left ≤", htMin: "Height ≥", htMax: "Height ≤", ibMin: "Dist from IB ≥", ibMax: "Dist from IB ≤", division: "Division", district: "District", blood: "Blood", religion: "Religion", marital: "Marital", med: "Med Cat", education: "Education", atts: "Attachment", living: "Living in" };
const HEIGHTS = Array.from({ length: 21 }, (_, i) => 58 + i).map((n) => ({ value: String(n), label: heightLabel(n) }));
const BREAKDOWNS: Array<{ key: string; label: string; get: (s: Soldier, coy: (id: string) => string) => string }> = [
  { key: "company", label: "Company", get: (s, coy) => coy(s.company_id) },
  { key: "rank", label: "Rank", get: (s) => s.rank },
  { key: "trade", label: "Trade", get: (s) => s.trade ?? "—" },
  { key: "home_division", label: "Home division", get: (s) => s.home_division ?? "—" },
  { key: "home_district", label: "Home district", get: (s) => s.home_district ?? "—" },
  { key: "blood_group", label: "Blood group", get: (s) => s.blood_group ?? "—" },
  { key: "age", label: "Age band", get: (s) => band(ageYears(s), [20, 25, 30, 35, 40, 45]) },
  { key: "svc", label: "Service band", get: (s) => band(serviceYears(s), [5, 10, 15, 20, 25]) },
  { key: "education", label: "Education", get: (s) => s.education ?? "—" },
  { key: "medical_category", label: "Medical category", get: (s) => s.medical_category ?? "—" },
  { key: "religion", label: "Religion", get: (s) => s.religion ?? "—" },
  { key: "accommodation", label: "Living in", get: (s) => s.accommodation ?? "Not recorded" },
];
function band(v: number | null, cuts: number[]) {
  if (v === null) return "Not recorded";
  const y = Math.floor(v);
  let lo = 0;
  for (const c of cuts) {
    if (y < c) return lo ? `${lo}–${c - 1} yrs` : `Under ${c} yrs`;
    lo = c;
  }
  return `${lo}+ yrs`;
}
const PRESETS: Array<{ label: string; f: Partial<Filters> }> = [
  { label: "Retiring within 1 yr", f: { leftMax: "1" } },
  { label: "Age 40+", f: { ageMin: "40" } },
  { label: "Service under 5 yrs", f: { svcMax: "5" } },
  { label: "Height 5'8\"+", f: { htMin: "68" } },
  { label: "Attached out", f: { atts: "any" } },
  { label: "Home within 50 km of border", f: { ibMax: "50" } },
  { label: "Living in snk lines", f: { living: "Snk Lines" } },
  { label: "Out living", f: { living: "Out Living" } },
];

export default function SoldiersPage() {
  const router = useRouter();
  const { perms, myCompanies, companyById, settings } = useSession();
  const { nameOf, t } = useI18n();
  const { data, error, loading, reload } = useAsync(listSoldiers, []);
  const [f, setF] = useState<Filters>(EMPTY);
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: "default", asc: true });
  const [cols, setCols] = useState<string[]>(SOLDIER_COLUMNS.filter((c) => c.default).map((c) => c.key));
  const [colModal, setColModal] = useState(false);
  const [breakdown, setBreakdown] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"course" | "duty" | null>(null);
  const { busy, run } = useAction();
  const canBulk = myCompanies.some((c) => perms.canEditCompany(c.id) || perms.canRosterCompany(c.id));

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ums-soldier-filters");
      if (saved) setF({ ...EMPTY, ...JSON.parse(saved) });
      const c = localStorage.getItem("ums-soldier-cols");
      if (c) setCols(JSON.parse(c));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("ums-soldier-filters", JSON.stringify(f)); } catch { /* ignore */ }
  }, [f]);
  const saveCols = (c: string[]) => {
    setCols(c);
    try { localStorage.setItem("ums-soldier-cols", JSON.stringify(c)); } catch { /* ignore */ }
  };

  const ctx = useMemo(() => ({ companyById, settings }), [companyById, settings]);
  const set = (k: keyof Filters, v: string) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));

  const rows = useMemo(() => {
    if (!data) return [];
    const q = f.q.trim().toLowerCase();
    const out = data.filter((s) => {
      if (f.status && s.status !== f.status) return false;
      if (f.company && s.company_id !== f.company) return false;
      if (f.category && s.category !== f.category) return false;
      if (f.rank && s.rank !== f.rank) return false;
      if (f.trade && s.trade !== f.trade) return false;
      if (f.division && s.home_division !== f.division) return false;
      if (f.district && s.home_district !== f.district) return false;
      if (f.blood && s.blood_group !== f.blood) return false;
      if (f.religion && s.religion !== f.religion) return false;
      if (f.marital && s.marital_status !== f.marital) return false;
      if (f.med && s.medical_category !== f.med) return false;
      if (f.education && s.education !== f.education) return false;
      if (f.living && s.accommodation !== f.living) return false;
      if (f.atts === "any" && !s.atts_type) return false;
      if (f.atts === "none" && s.atts_type) return false;
      if ((f.atts === "Temp Atts" || f.atts === "Perm Atts") && s.atts_type !== f.atts) return false;
      const rangeOk = (v: number | null, lo: number | null, hi: number | null) => (lo === null || (v !== null && v >= lo)) && (hi === null || (v !== null && v <= hi));
      if (!rangeOk(ageYears(s), num(f.ageMin), num(f.ageMax) === null ? null : num(f.ageMax)! + 0.9999)) return false;
      if (!rangeOk(serviceYears(s), num(f.svcMin), num(f.svcMax) === null ? null : num(f.svcMax)! + 0.9999)) return false;
      if (!rangeOk(serviceLeftYears(s, settings), num(f.leftMin), num(f.leftMax))) return false;
      if (!rangeOk(s.height_in, num(f.htMin), num(f.htMax))) return false;
      if (!rangeOk(s.distance_from_ib_km === null || s.distance_from_ib_km === undefined ? null : Number(s.distance_from_ib_km), num(f.ibMin), num(f.ibMax))) return false;
      if (q && !`${s.snk_no} ${s.rank} ${s.name} ${s.name_bn ?? ""} ${s.trade ?? ""} ${s.mobile ?? ""} ${s.appointment ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const col = SOLDIER_COLUMNS.find((c) => c.key === sort.key);
    const catOrder: Record<string, number> = { Offr: 0, JCO: 1, OR: 2 };
    const rankIdx = (s: Soldier) => { const l = settings.ranks[s.category] ?? []; const i = l.indexOf(s.rank); return i < 0 ? 99 : i; };
    return out.sort((a, b) => {
      if (col) {
        const va = col.sort(a, ctx), vb = col.sort(b, ctx);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (sort.asc ? 1 : -1) * (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true }));
      }
      return (companyById.get(a.company_id)?.display_order ?? 99) - (companyById.get(b.company_id)?.display_order ?? 99) || catOrder[a.category] - catOrder[b.category] || rankIdx(a) - rankIdx(b) || a.snk_no.localeCompare(b.snk_no, undefined, { numeric: true });
    });
  }, [data, f, sort, ctx, settings, companyById]);

  const strength = useMemo(() => rows.reduce((s, r) => addStrength(s, r.category), zeroStrength()), [rows]);
  const active = (Object.keys(f) as Array<keyof Filters>).filter((k) => f[k] && !(k === "status" && f[k] === "Serving"));
  const shownCols = SOLDIER_COLUMNS.filter((c) => cols.includes(c.key));
  const ranks = f.category ? settings.ranks[f.category as keyof typeof settings.ranks] ?? [] : Object.values(settings.ranks).flat();
  const districts = f.division ? DIVISIONS[f.division] ?? [] : ALL_DISTRICTS;

  const breakdownRows = useMemo(() => {
    const b = BREAKDOWNS.find((x) => x.key === breakdown);
    if (!b) return [];
    const m = new Map<string, ReturnType<typeof zeroStrength>>();
    for (const s of rows) {
      const k = b.get(s, (id) => companyById.get(id)?.name ?? "—");
      m.set(k, addStrength(m.get(k) ?? zeroStrength(), s.category));
    }
    return [...m.entries()].sort((a, b2) => (b.key === "company" ? 0 : b2[1].Offr + b2[1].JCO + b2[1].OR - (a[1].Offr + a[1].JCO + a[1].OR)));
  }, [breakdown, rows, companyById]);

  const picked = rows.filter((r) => selected.has(r.id));
  useEffect(() => { setSelected((cur) => { const ids = new Set(rows.map((r) => r.id)); const n = new Set([...cur].filter((x) => ids.has(x))); return n.size === cur.size ? cur : n; }); }, [rows]);
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  async function setLiving(v: string) {
    const targets = picked.filter((x) => perms.canEditCompany(x.company_id));
    await run(async () => { for (const x of targets) await saveSoldier({ id: x.id, accommodation: v as Soldier["accommodation"] }); await reload(); }, `${targets.length} updated — living in ${v}`);
  }

  async function exportRows(all: boolean, only?: Soldier[]) {
    const columns = all ? SOLDIER_COLUMNS : shownCols;
    await exportXlsx(`Soldiers_${bdToday()}`, [
      { name: "Soldiers", rows: (only ?? rows).map((s, i) => Object.fromEntries([["Ser", i + 1], ...columns.map((c: Column) => [c.label, c.xl ? c.xl(s, ctx) : c.show(s, ctx)])])) },
      { name: "Filters", rows: [{ Filter: "Exported", Value: bdToday() }, { Filter: "Count", Value: `${rows.length} (${strengthLabel(strength)})` }, ...active.map((k) => ({ Filter: FILTER_LABEL[k], Value: f[k] }))] },
    ]);
  }

  async function exportPdf(only?: Soldier[]) {
    const list = only ?? rows;
    const sortCol = SOLDIER_COLUMNS.find((c) => c.key === sort.key);
    await exportTablePdf({
      filename: `Soldiers_${bdToday()}`,
      unit: settings.unit.name,
      title: perms.canViewAll ? "Soldiers Database — sorted list" : `${myCompanies[0]?.name ?? "Coy"} — soldiers`,
      subtitle: `Sorted by ${sortCol ? `${sortCol.label} (${sort.asc ? "ascending" : "descending"})` : "Coy, rank and Personal No"}`,
      chips: [
        { label: "Soldiers", value: String(list.length), color: "#1c3d57" },
        { label: "Offr+JCO+OR", value: strengthLabel(list.reduce((st, r) => addStrength(st, r.category), zeroStrength())), color: "#4f6f52" },
        ...active.slice(0, 6).map((k) => ({ label: FILTER_LABEL[k], value: String(chipValue(k)), color: "#2f78b7" })),
      ],
      columns: shownCols.map((c) => ({ header: c.label, key: c.key, align: c.num ? "right" as const : "left" as const })),
      rows: list.map((s) => ({ ...Object.fromEntries(shownCols.map((c) => [c.key, c.show(s, ctx)])), __coy: s.company_id })),
      colorize: (k, v) => (k === "status" || k === "medical_category" && v !== "A" ? statusColour(k, v) ?? (k === "medical_category" ? "#b07812" : null) : null),
      rowAccent: (r) => colorFor(companyById.get(String(r.__coy))?.short_name ?? ""),
    });
  }

  const chipValue = (k: keyof Filters) => {
    const v = f[k];
    if (k === "company") return companyById.get(v)?.short_name ?? v;
    if (k === "htMin" || k === "htMax") return heightLabel(Number(v));
    if (["ageMin", "ageMax", "svcMin", "svcMax", "leftMin", "leftMax"].includes(k)) return `${v} yrs`;
    if (k === "ibMin" || k === "ibMax") return `${v} km`;
    if (k === "atts") return v === "any" ? "Attached" : v === "none" ? "Not attached" : v;
    return v;
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Personnel"
        title="Soldiers Database"
        subtitle={perms.canViewAll ? undefined : myCompanies[0]?.name}
        actions={
          <>
            <button className="btn" onClick={() => exportRows(false)} disabled={!rows.length}><Download size={15} /> Excel</button>
            <button className="btn" onClick={() => exportPdf()} disabled={!rows.length}><FileText size={15} /> PDF</button>
            {myCompanies.some((c) => perms.canEditCompany(c.id)) && <Link href="/soldiers/edit" className="btn btn-primary"><Plus size={15} /> Add soldier</Link>}
          </>
        }
      />
      <ErrorBox error={error} onRetry={reload} />

      <Card className="mb">
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <div className="search">
            <Search size={15} />
            <input className="input" placeholder="Search Personal No, name, trade, mobile…" value={f.q} onChange={(e) => set("q", e.target.value)} />
          </div>
          {myCompanies.length > 1 && <Select value={f.company} onChange={(v) => set("company", v)} placeholder="All coys" options={myCompanies.map((c) => ({ value: c.id, label: c.name }))} />}
          <Select value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v, rank: "" }))} placeholder="All cat" options={CATEGORIES} />
          <Select value={f.status} onChange={(v) => set("status", v)} placeholder="Any status" options={SOLDIER_STATUSES} />
          <button className={cls("btn", more && "btn-primary")} onClick={() => setMore(!more)}><Filter size={15} /> More filters{active.length ? ` (${active.length})` : ""}</button>
          <button className="btn btn-ghost" onClick={() => setColModal(true)}><Columns3 size={15} /> Columns</button>
          {active.length > 0 && <button className="btn btn-ghost" onClick={() => setF(EMPTY)}><RotateCcw size={14} /> Clear</button>}
        </div>
        {more && (
          <div className="filters" style={{ paddingTop: 6 }}>
            <Field label="Rank"><Select value={f.rank} onChange={(v) => set("rank", v)} placeholder="Any" options={ranks} /></Field>
            <Field label="Trade"><Select value={f.trade} onChange={(v) => set("trade", v)} placeholder="Any" options={[...new Set([...settings.trades, ...(data ?? []).map((s) => s.trade).filter(Boolean) as string[]])]} /></Field>
            <Field label="Age (years)"><div className="range"><input className="input" type="number" placeholder="Min" value={f.ageMin} onChange={(e) => set("ageMin", e.target.value)} /><span>to</span><input className="input" type="number" placeholder="Max" value={f.ageMax} onChange={(e) => set("ageMax", e.target.value)} /></div></Field>
            <Field label="Service length (years)"><div className="range"><input className="input" type="number" placeholder="Min" value={f.svcMin} onChange={(e) => set("svcMin", e.target.value)} /><span>to</span><input className="input" type="number" placeholder="Max" value={f.svcMax} onChange={(e) => set("svcMax", e.target.value)} /></div></Field>
            <Field label="Service left (years)"><div className="range"><input className="input" type="number" step="0.5" placeholder="Min" value={f.leftMin} onChange={(e) => set("leftMin", e.target.value)} /><span>to</span><input className="input" type="number" step="0.5" placeholder="Max" value={f.leftMax} onChange={(e) => set("leftMax", e.target.value)} /></div></Field>
            <Field label="Height"><div className="range"><Select value={f.htMin} onChange={(v) => set("htMin", v)} placeholder="Min" options={HEIGHTS} /><span>to</span><Select value={f.htMax} onChange={(v) => set("htMax", v)} placeholder="Max" options={HEIGHTS} /></div></Field>
            <Field label="Distance from Intl Boundary (km)"><div className="range"><input className="input" type="number" placeholder="Min" value={f.ibMin} onChange={(e) => set("ibMin", e.target.value)} /><span>to</span><input className="input" type="number" placeholder="Max" value={f.ibMax} onChange={(e) => set("ibMax", e.target.value)} /></div></Field>
            <Field label="Home division"><Select value={f.division} onChange={(v) => setF((x) => ({ ...x, division: v, district: "" }))} placeholder="Any" options={Object.keys(DIVISIONS)} /></Field>
            <Field label="Home district"><Select value={f.district} onChange={(v) => set("district", v)} placeholder="Any" options={districts} /></Field>
            <Field label="Blood group"><Select value={f.blood} onChange={(v) => set("blood", v)} placeholder="Any" options={BLOOD_GROUPS} /></Field>
            <Field label="Medical category"><Select value={f.med} onChange={(v) => set("med", v)} placeholder="Any" options={MEDICAL_CATEGORIES} /></Field>
            <Field label="Religion"><Select value={f.religion} onChange={(v) => set("religion", v)} placeholder="Any" options={RELIGIONS} /></Field>
            <Field label="Marital status"><Select value={f.marital} onChange={(v) => set("marital", v)} placeholder="Any" options={MARITAL_STATUSES} /></Field>
            <Field label="Education"><Select value={f.education} onChange={(v) => set("education", v)} placeholder="Any" options={EDUCATION_LEVELS} /></Field>
            <Field label="Living in"><Select value={f.living} onChange={(v) => set("living", v)} placeholder="Any" options={ACCOMMODATION} /></Field>
            <Field label="Attachment"><Select value={f.atts} onChange={(v) => set("atts", v)} placeholder="Any" options={[{ value: "any", label: "Attached out (any)" }, { value: "Temp Atts", label: "Temp Atts" }, { value: "Perm Atts", label: "Perm Atts" }, { value: "none", label: "Not attached" }]} /></Field>
          </div>
        )}
        <div className="row-between" style={{ marginTop: 10 }}>
          <div className="chips">
            {active.map((k) => (
              <span className="chip" key={k}>{FILTER_LABEL[k]}: {chipValue(k)}<button onClick={() => set(k, k === "status" ? "Serving" : "")} aria-label="Remove filter"><X size={11} /></button></span>
            ))}
            {active.length === 0 && PRESETS.map((p) => <button key={p.label} className="btn btn-xs" onClick={() => setF((x) => ({ ...x, ...p.f }))}>{p.label}</button>)}
          </div>
          <div className="row small">
            <strong>{rows.length}</strong> <span>{t("soldiers")}</span> · <span className="mono">{strengthLabel(strength)}</span>
            <span className="muted">(Offr+JCO+OR)</span>
          </div>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="bulk-bar on">
          <strong>{selected.size} {t("selected")}</strong>
          <button className="btn btn-sm" onClick={() => exportRows(false, picked)}><Download size={13} /> Excel</button>
          <button className="btn btn-sm" onClick={() => exportPdf(picked)}><FileText size={13} /> PDF</button>
          {myCompanies.some((c) => perms.canEditCompany(c.id)) && <>
            <select className="input input-sm" value="" disabled={busy} onChange={(e) => e.target.value && setLiving(e.target.value)}>
              <option value="">{t("Set living in…")}</option>{ACCOMMODATION.map((a) => <option key={a} value={a}>{t(a)}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => setBulk("course")}><GraduationCap size={13} /> {t("Nominate for course")}</button>
          </>}
          {myCompanies.some((c) => perms.canRosterCompany(c.id)) && <button className="btn btn-sm" onClick={() => setBulk("duty")}><ShieldCheck size={13} /> {t("Detail for duty")}</button>}
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}><X size={13} /> {t("Clear")}</button>
        </div>
      )}
      {bulk && <BulkActionModal kind={bulk} soldiers={picked} onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSelected(new Set()); }} />}

      {loading && !data ? <Loading /> : (
        <div className="grid" style={{ gridTemplateColumns: breakdown ? "minmax(0,1fr) 300px" : "minmax(0,1fr)" }}>
          <Card pad={false}>
            {rows.length === 0 ? <Empty>No soldier matches these filters.</Empty> : (
              <div className="table-wrap tall">
                <table className="table nowrap-cells">
                  <thead>
                    <tr>
                      {canBulk && <th style={{ width: 30 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
                      <th className="num">#</th>
                      {shownCols.map((c) => (
                        <th key={c.key} className={cls("sortable", c.num && "num", c.key === "name" && "sticky-col")} onClick={() => setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))}>
                          {c.label} {sort.key === c.key && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr key={s.id} className={cls(s.status !== "Serving" && "row-muted", selected.has(s.id) && "row-selected")} style={{ cursor: "pointer" }} onClick={() => router.push(`/soldiers/view?id=${s.id}`)}>
                        {canBulk && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>}
                        <td className="num muted">{i + 1}</td>
                        {shownCols.map((c) => (
                          <td key={c.key} className={cls(c.num && "num", c.key === "name" && "sticky-col strong", c.key === "snk_no" && "mono")}>
                            {c.key === "name" ? <>{nameOf(s)}{s.atts_type && <> <Badge tone="amber">{s.atts_type}</Badge></>}</> : c.show(s, ctx)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {breakdown && (
            <Card title={`By ${BREAKDOWNS.find((b) => b.key === breakdown)?.label.toLowerCase()}`} actions={<button className="icon-btn" onClick={() => setBreakdown("")}><X size={15} /></button>} pad={false}>
              <div className="table-wrap" style={{ maxHeight: "calc(100vh - 300px)" }}>
                <table className="table compact">
                  <thead><tr><th>Group</th><th className="num">O+J+OR</th><th className="num">Total</th></tr></thead>
                  <tbody>{breakdownRows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num mono">{strengthLabel(v)}</td><td className="num strong">{v.Offr + v.JCO + v.OR}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
      {!breakdown && rows.length > 0 && (
        <div className="row mt small">
          <span className="muted">{t("Analyse these soldiers by:")} ({rows.length})</span>
          {BREAKDOWNS.map((b) => <button key={b.key} className="btn btn-xs" onClick={() => setBreakdown(b.key)}>{b.label}</button>)}
        </div>
      )}

      <Modal open={colModal} onClose={() => setColModal(false)} title="Choose columns" footer={<><button className="btn" onClick={() => saveCols(SOLDIER_COLUMNS.filter((c) => c.default).map((c) => c.key))}>Default</button><button className="btn" onClick={() => exportRows(true)}><Download size={14} /> Export all columns</button><button className="btn btn-primary" onClick={() => setColModal(false)}>Done</button></>}>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
          {SOLDIER_COLUMNS.map((c) => (
            <label className="check" key={c.key}>
              <input type="checkbox" checked={cols.includes(c.key)} onChange={(e) => saveCols(e.target.checked ? SOLDIER_COLUMNS.filter((x) => cols.includes(x.key) || x.key === c.key).map((x) => x.key) : cols.filter((x) => x !== c.key))} />
              {c.label}
            </label>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>* = estimated retirement date</p>
      </Modal>
    </div>
  );
}

/** One form, many soldiers: nominate all for a course, or detail all for a duty. */
function BulkActionModal({ kind, soldiers, onClose, onDone }: { kind: "course" | "duty"; soldiers: Soldier[]; onClose: () => void; onDone: () => void }) {
  const { perms, settings } = useSession();
  const today = bdToday();
  const [v, setV] = useState<Record<string, string>>(kind === "course" ? { course_type: "External", from_date: today } : { date: today, duty_type: settings.duty_types[0] ?? "" });
  const { busy, run } = useAction();
  const allowed = soldiers.filter((s) => (kind === "course" ? perms.canEditCompany(s.company_id) : perms.canRosterCompany(s.company_id)));
  const set = (k: string, x: string) => setV((cur) => ({ ...cur, [k]: x }));
  const ok = kind === "course" ? !!v.course_name?.trim() : !!v.date && !!v.duty_type;
  async function submit() {
    await run(async () => {
      for (const s of allowed) {
        if (kind === "course") await saveCourse({ soldier_id: s.id, company_id: s.company_id, course_name: v.course_name.trim(), institution: v.institution || null, course_type: v.course_type as "External", from_date: v.from_date || null, to_date: v.to_date || null, status: "Nominated" });
        else await saveDuty({ soldier_id: s.id, company_id: s.company_id, date: v.date, duty_type: v.duty_type, shift: v.shift || null, remarks: v.remarks || null });
      }
      onDone();
    }, kind === "course" ? `${allowed.length} nominated` : `${allowed.length} detailed for ${v.duty_type}`);
  }
  return (
    <Modal open onClose={onClose} title={kind === "course" ? `Nominate ${allowed.length} for a course` : `Detail ${allowed.length} for duty`}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !ok || !allowed.length} onClick={submit}>Save for {allowed.length}</button></>}>
      {allowed.length < soldiers.length && <Alert tone="amber">{soldiers.length - allowed.length} selected soldier(s) are outside your company and will be skipped.</Alert>}
      <div className="form-grid">
        {kind === "course" ? <>
          <Field label="Course" required wide><input className="input" value={v.course_name ?? ""} onChange={(e) => set("course_name", e.target.value)} placeholder="e.g. Radio Mech Course" /></Field>
          <Field label="Institution"><input className="input" value={v.institution ?? ""} onChange={(e) => set("institution", e.target.value)} /></Field>
          <Field label="Type" hint="External = absent from unit"><Select value={v.course_type} onChange={(x) => set("course_type", x)} options={["External", "Internal"]} /></Field>
          <Field label="From"><input className="input" type="date" value={v.from_date ?? ""} onChange={(e) => set("from_date", e.target.value)} /></Field>
          <Field label="To"><input className="input" type="date" value={v.to_date ?? ""} onChange={(e) => set("to_date", e.target.value)} /></Field>
        </> : <>
          <Field label="Date" required><input className="input" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Duty" required><Select value={v.duty_type} onChange={(x) => set("duty_type", x)} options={settings.duty_types} /></Field>
          <Field label="Shift"><input className="input" value={v.shift ?? ""} onChange={(e) => set("shift", e.target.value)} placeholder="e.g. 0600–1400" /></Field>
          <Field label="Remarks"><input className="input" value={v.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
        </>}
      </div>
      <p className="small muted mt">{allowed.slice(0, 12).map((s) => `${s.rank} ${s.name}`).join(", ")}{allowed.length > 12 ? ` … +${allowed.length - 12}` : ""}</p>
    </Modal>
  );
}
