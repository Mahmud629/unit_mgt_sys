"use client";

import { useEffect, useState } from "react";
import { ListChecks, Plus, Save } from "lucide-react";
import { Alert, Badge, Card, Field, PageHeader, Tabs, useAction } from "@/components/ui";
import { saveCompany, saveLeaveType, saveSetting, saveTrainingType } from "@/lib/api";
import { CATEGORIES, DEFAULT_SETTINGS, MEDICAL_CATEGORIES, STANDARD_UNITS } from "@/lib/constants";
import { useSession } from "@/lib/session";
import type { AppSettings, Category, Company, LeaveType, TrainingType } from "@/lib/types";

type TabKey = "unit" | "companies" | "leave" | "training" | "lists" | "retirement";

export default function SettingsPage() {
  const { perms } = useSession();
  const [tab, setTab] = useState<TabKey>("unit");
  if (!perms.canEditSettings) return <div className="page"><Alert tone="red">Only Admin or Adjt can change settings.</Alert></div>;
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader eyebrow="Administration" title="Settings" />
      <Tabs tabs={[{ key: "unit", label: "Unit" }, { key: "companies", label: "Companies" }, { key: "leave", label: "Leave types" }, { key: "training", label: "Training tests" }, { key: "lists", label: "Lists" }, { key: "retirement", label: "Retirement rules" }]} value={tab} onChange={setTab} />
      {tab === "unit" && <div className="stack"><UnitTab /><ParadeWindowsCard /></div>}
      {tab === "companies" && <CompaniesTab />}
      {tab === "leave" && <LeaveTab />}
      {tab === "training" && <div className="stack"><ExemptionCard /><TrainingTab /></div>}
      {tab === "lists" && <ListsTab />}
      {tab === "retirement" && <RetirementTab />}
    </div>
  );
}

function UnitTab() {
  const { settings, reload } = useSession();
  const [u, setU] = useState(settings.unit);
  const { busy, run } = useAction();
  return (
    <Card title="Unit details" actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await saveSetting("unit", u); await reload(["settings"]); }, "Saved")}><Save size={13} /> Save</button>}>
      <div className="form-grid">
        <Field label="Unit name"><input className="input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
        <Field label="Short name"><input className="input" value={u.short} onChange={(e) => setU({ ...u, short: e.target.value })} /></Field>
      </div>
    </Card>
  );
}

function ParadeWindowsCard() {
  const { settings, reload } = useSession();
  const [w, setW] = useState(settings.parade_windows ?? DEFAULT_SETTINGS.parade_windows);
  const { busy, run } = useAction();
  const f = (k: keyof typeof w, label: string, hint: string) => (
    <Field label={label} hint={hint}><input className="input" type="time" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} /></Field>
  );
  return (
    <Card title="Parade state times" actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await saveSetting("parade_windows", w); await reload(["settings"]); }, "Saved")}><Save size={13} /> Save</button>}>
      <div className="form-grid">
        {f("open_time", "Next day's states open at", "On the evening before (e.g. 1800 hrs on 23 Oct for the 24 Oct state)")}
        {f("morning_close", "Morning State closes at", "On the day itself — it is finalized automatically")}
        {f("second_close", "2nd Parade State closes at", "On the day itself")}
        {f("extra_close", "Extra states close at (default)", "Durbar, Firing etc. — can be changed when opening one")}
      </div>
      <p className="muted small mt">Adjt, Bn Rep and Admin can still edit, finalize early or reopen (adds 2 hours).</p>
    </Card>
  );
}

function CompaniesTab() {
  const { companies, perms, reload, directory } = useSession();
  const [rows, setRows] = useState<Partial<Company>[]>(companies);
  useEffect(() => setRows(companies), [companies]);
  const [summary, setSummary] = useState<string[] | null>(null);
  const { busy, run } = useAction();
  const norm = (x?: string | null) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const strength = (id?: string) => directory.filter((d) => d.company_id === id && d.status === "Serving").length;
  const standardOf = (c: Partial<Company>) => STANDARD_UNITS.find((u) => u.slug === c.slug || [u.name, u.short, ...(u.also ?? [])].map(norm).includes(norm(c.name)));
  // Adds missing official units (121 BSC included), re-activates them and puts them in order. Safe to press again.
  async function applyStandard() {
    const out: string[] = [];
    for (const [i, u] of STANDARD_UNITS.entries()) {
      const found = companies.find((c) => c.slug === u.slug) ?? companies.find((c) => standardOf(c)?.slug === u.slug);
      if (!found) { await saveCompany({ slug: u.slug, name: u.name, short_name: u.short, display_order: i + 1, active: true }); out.push(`Added ${u.name}`); continue; }
      const patch: Partial<Company> = {};
      if (!found.active) patch.active = true;
      if (found.display_order !== i + 1) patch.display_order = i + 1;
      if (Object.keys(patch).length) { await saveCompany({ id: found.id, ...patch }); out.push(`${found.name}: ${patch.active ? "re-activated" : ""}${patch.active && patch.display_order ? ", " : ""}${patch.display_order ? `order ${i + 1}` : ""}`); }
    }
    let n = STANDARD_UNITS.length;
    for (const c of companies.filter((x) => !standardOf(x) && x.active)) {
      const s = strength(c.id);
      if (s === 0) { await saveCompany({ id: c.id, active: false, display_order: ++n }); out.push(`${c.name}: not in the standard list and empty — deactivated`); }
      else out.push(`${c.name}: not in the standard list but has ${s} soldier(s) — move them, then deactivate it`);
    }
    await reload(["companies"]);
    setSummary(out.length ? out : ["Already up to date — nothing changed."]);
  }
  const set = (i: number, k: keyof Company, v: string | number | boolean) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Companies / sub-units" actions={perms.isAdmin && <><button className="btn btn-sm" onClick={() => setRows([...rows, { name: "", short_name: "", slug: "", display_order: rows.length + 1, active: true }])}><Plus size={13} /> Add</button>
      <button className="btn btn-sm" disabled={busy} onClick={() => run(applyStandard, "Standard unit list applied")}><ListChecks size={13} /> Apply standard unit list</button>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { for (const c of rows) if (c.name) await saveCompany({ ...c, slug: c.slug || c.name!.toLowerCase().replace(/[^a-z0-9]+/g, "-") }); await reload(["companies"]); }, "Saved")}><Save size={13} /> Save</button></>} pad={false}>
      {!perms.isAdmin && <div style={{ padding: 14 }}><Alert tone="blue">Only Admin can change companies.</Alert></div>}
      {summary && <div style={{ padding: "12px 14px 0" }}><Alert tone="green"><strong>Standard unit list</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{summary.map((x) => <li key={x}>{x}</li>)}</ul></Alert></div>}
      <p className="small muted" style={{ padding: "10px 14px 0", margin: 0 }}>Official list: {STANDARD_UNITS.map((u) => u.name).join(" · ")}</p>
      <div className="table-wrap"><table className="table compact">
        <thead><tr><th>Order</th><th>Name</th><th>Short</th><th className="num">Soldiers</th><th>Active</th><th /></tr></thead>
        <tbody>{rows.map((c, i) => (
          <tr key={c.id ?? i}>
            <td style={{ width: 80 }}><input className="input input-sm" type="number" value={c.display_order ?? 0} disabled={!perms.isAdmin} onChange={(e) => set(i, "display_order", Number(e.target.value))} /></td>
            <td><input className="input input-sm" value={c.name ?? ""} disabled={!perms.isAdmin} onChange={(e) => set(i, "name", e.target.value)} /></td>
            <td style={{ width: 120 }}><input className="input input-sm" value={c.short_name ?? ""} disabled={!perms.isAdmin} onChange={(e) => set(i, "short_name", e.target.value)} /></td>
            <td className="num">{c.id ? strength(c.id) : ""}</td>
            <td><input type="checkbox" checked={c.active ?? true} disabled={!perms.isAdmin} onChange={(e) => set(i, "active", e.target.checked)} /></td>
            <td>{c.name && !standardOf(c) && <Badge tone="amber">Not in standard list</Badge>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function LeaveTab() {
  const { leaveTypes, reload } = useSession();
  const [rows, setRows] = useState<Partial<LeaveType>[]>(leaveTypes);
  const { busy, run } = useAction();
  const set = (i: number, k: keyof LeaveType, v: unknown) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Leave types & annual entitlement" actions={<><button className="btn btn-sm" onClick={() => setRows([...rows, { code: "", name: "", annual_quota: null, active: true, display_order: rows.length + 1 }])}><Plus size={13} /> Add</button>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { for (const t of rows) if (t.code && t.name) await saveLeaveType(t); await reload(["leaveTypes"]); }, "Saved")}><Save size={13} /> Save</button></>} pad={false}>
      <div style={{ padding: "12px 16px 0" }}><Alert tone="amber">Default entitlements are starting values only. Set them according to current regulations. Leave the quota empty for types with no annual limit.</Alert></div>
      <div className="table-wrap"><table className="table compact">
        <thead><tr><th>Code</th><th>Name</th><th>Days / year</th><th>Order</th><th>Active</th></tr></thead>
        <tbody>{rows.map((t, i) => (
          <tr key={t.id ?? i}>
            <td style={{ width: 100 }}><input className="input input-sm" value={t.code ?? ""} onChange={(e) => set(i, "code", e.target.value.toUpperCase())} /></td>
            <td style={{ minWidth: 190 }}><input className="input input-sm" value={t.name ?? ""} onChange={(e) => set(i, "name", e.target.value)} /></td>
            <td style={{ width: 120 }}><input className="input input-sm" type="number" value={t.annual_quota ?? ""} placeholder="no limit" onChange={(e) => set(i, "annual_quota", e.target.value === "" ? null : Number(e.target.value))} /></td>
            <td style={{ width: 80 }}><input className="input input-sm" type="number" value={t.display_order ?? 0} onChange={(e) => set(i, "display_order", Number(e.target.value))} /></td>
            <td><input type="checkbox" checked={t.active ?? true} onChange={(e) => set(i, "active", e.target.checked)} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function TrainingTab() {
  const { trainingTypes, reload } = useSession();
  const [rows, setRows] = useState<Partial<TrainingType>[]>(trainingTypes);
  const { busy, run } = useAction();
  const set = (i: number, k: keyof TrainingType, v: unknown) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Mandatory training tests" actions={<><button className="btn btn-sm" onClick={() => setRows([...rows, { code: "", name: "", frequency: 1, sequence_label: "No", max_attempts: 1, has_marks: false, applies_to: ["Offr", "JCO", "OR"], active: true, display_order: rows.length + 1 }])}><Plus size={13} /> Add test</button>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { for (const t of rows) if (t.code && t.name) await saveTrainingType(t); await reload(["trainingTypes"]); }, "Saved")}><Save size={13} /> Save</button></>} pad={false}>
      <div className="table-wrap"><table className="table compact">
        <thead><tr><th>Code</th><th>Name</th><th>Times / year</th><th>Each called</th><th>Max attempts</th><th>Marks</th><th>Pass mark</th><th title="Recorded as Completed / Not completed instead of Pass / Fail">Completed / Not</th><th>Applies to</th><th>Active</th></tr></thead>
        <tbody>{rows.map((t, i) => (
          <tr key={t.id ?? i}>
            <td style={{ minWidth: 80 }}><input className="input input-sm" value={t.code ?? ""} onChange={(e) => set(i, "code", e.target.value.toUpperCase())} /></td>
            <td style={{ minWidth: 190 }}><input className="input input-sm" value={t.name ?? ""} onChange={(e) => set(i, "name", e.target.value)} /></td>
            <td style={{ width: 80 }}><input className="input input-sm" type="number" min={1} max={12} value={t.frequency ?? 1} onChange={(e) => set(i, "frequency", Number(e.target.value))} /></td>
            <td style={{ width: 110 }}><input className="input input-sm" value={t.sequence_label ?? ""} onChange={(e) => set(i, "sequence_label", e.target.value)} /></td>
            <td style={{ width: 80 }}><input className="input input-sm" type="number" min={1} max={5} value={t.max_attempts ?? 1} onChange={(e) => set(i, "max_attempts", Number(e.target.value))} /></td>
            <td><input type="checkbox" checked={!!t.has_marks} onChange={(e) => set(i, "has_marks", e.target.checked)} /></td>
            <td style={{ width: 80 }}><input className="input input-sm" type="number" value={t.pass_mark ?? ""} disabled={!t.has_marks} onChange={(e) => set(i, "pass_mark", e.target.value === "" ? null : Number(e.target.value))} /></td>
            <td><input type="checkbox" checked={!!t.completion_only} onChange={(e) => set(i, "completion_only", e.target.checked)} title="Completed / On going / Yet to complete — Exempted (e.g. Group Training)" /></td>
            <td className="nowrap">{CATEGORIES.map((c) => <label className="check small" key={c} style={{ marginRight: 6 }}><input type="checkbox" checked={(t.applies_to ?? []).includes(c)} onChange={(e) => set(i, "applies_to", e.target.checked ? [...(t.applies_to ?? []), c] : (t.applies_to ?? []).filter((x) => x !== c))} />{c}</label>)}</td>
            <td><input type="checkbox" checked={t.active ?? true} onChange={(e) => set(i, "active", e.target.checked)} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function ListEditor({ title, k, hint }: { title: string; k: "trades" | "duty_types" | "employment_types" | "absent_reasons" | "officer_appointments"; hint?: string }) {
  const { settings, reload } = useSession();
  const [text, setText] = useState((settings[k] ?? DEFAULT_SETTINGS[k]).join("\n"));
  const { busy, run } = useAction();
  return (
    <Card title={title} actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await saveSetting(k, text.split("\n").map((x) => x.trim()).filter(Boolean)); await reload(["settings"]); }, "Saved")}><Save size={13} /> Save</button>}>
      <textarea className="input" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="small muted" style={{ marginBottom: 0 }}>One per line.{hint ? ` ${hint}` : ""}</p>
    </Card>
  );
}

function ListsTab() {
  const { settings, reload } = useSession();
  const [ranks, setRanks] = useState<Record<Category, string>>({ Offr: settings.ranks.Offr.join(", "), JCO: settings.ranks.JCO.join(", "), OR: settings.ranks.OR.join(", ") });
  const { busy, run } = useAction();
  return (
    <div className="stack">
      <Card title="Ranks (senior first)" actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await saveSetting("ranks", Object.fromEntries(CATEGORIES.map((c) => [c, ranks[c].split(",").map((x) => x.trim()).filter(Boolean)]))); await reload(["settings"]); }, "Saved")}><Save size={13} /> Save</button>}>
        <div className="form-grid">{CATEGORIES.map((c) => <Field key={c} label={c} wide><input className="input" value={ranks[c]} onChange={(e) => setRanks({ ...ranks, [c]: e.target.value })} /></Field>)}</div>
      </Card>
      <div className="grid grid-2">
        <ListEditor title="Trades" k="trades" />
        <ListEditor title="Duty types (duty roster)" k="duty_types" />
        <ListEditor title="Employment (parade state)" k="employment_types" hint="Shown as 'Employed' options." />
        <ListEditor title="Absent reasons (parade state)" k="absent_reasons" hint="Keep Leave, Course, Hospital, Temp Atts and Perm Atts — the automatic fill uses them." />
        <ListEditor title="Officers' appointments" k="officer_appointments" hint="Standard list: Adjt, QM, Coy Comd, 2IC, CO. Offered when an officer's appointment is entered." />
      </div>
    </div>
  );
}

function RetirementTab() {
  const { settings, reload } = useSession();
  const rules = settings.retirement_rules;
  const allRanks = Object.values(settings.ranks).flat();
  const [svc, setSvc] = useState<Record<string, string>>(Object.fromEntries(allRanks.map((r) => [r, rules.svc_years_by_rank?.[r] ? String(rules.svc_years_by_rank[r]) : ""])));
  const [age, setAge] = useState<Record<string, string>>(Object.fromEntries(CATEGORIES.map((c) => [c, rules.age_limit_by_category?.[c] ? String(rules.age_limit_by_category[c]) : ""])));
  const { busy, run } = useAction();
  async function save() {
    const value: AppSettings["retirement_rules"] = {
      note: rules.note,
      svc_years_by_rank: Object.fromEntries(Object.entries(svc).filter(([, v]) => v).map(([k, v]) => [k, Number(v)])),
      age_limit_by_category: Object.fromEntries(Object.entries(age).filter(([, v]) => v).map(([k, v]) => [k, Number(v)])),
    };
    await run(async () => { await saveSetting("retirement_rules", value); await reload(["settings"]); }, "Saved");
  }
  return (
    <Card title="Retirement estimate rules" actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={save}><Save size={13} /> Save</button>}>
      <Alert tone="blue">&quot;Service left&quot; uses each soldier&apos;s <strong>Retirement / LPR date</strong> when it is entered. For soldiers without that date, the system can <em>estimate</em> it from the limits below (whichever comes first). Leave empty to show &quot;—&quot; instead of an estimate. Enter values from current service rules.</Alert>
      <h3 className="small" style={{ textTransform: "uppercase", letterSpacing: 1, color: "var(--green)" }}>Maximum service (years) by rank</h3>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>{allRanks.map((r) => <Field key={r} label={r}><input className="input" type="number" value={svc[r] ?? ""} onChange={(e) => setSvc({ ...svc, [r]: e.target.value })} /></Field>)}</div>
      <h3 className="small mt" style={{ textTransform: "uppercase", letterSpacing: 1, color: "var(--green)" }}>Age limit by category</h3>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>{CATEGORIES.map((c) => <Field key={c} label={c}><input className="input" type="number" value={age[c] ?? ""} onChange={(e) => setAge({ ...age, [c]: e.target.value })} /></Field>)}</div>
    </Card>
  );
}

function ExemptionCard() {
  const { settings, trainingTypes, reload } = useSession();
  const [r, setR] = useState(settings.training_exemption);
  const { busy, run } = useAction();
  const toggle = (k: "med_cats" | "tests", v: string, on: boolean) => setR({ ...r, [k]: on ? [...r[k], v] : r[k].filter((x) => x !== v) });
  return (
    <Card title="Automatic exemption" actions={<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await saveSetting("training_exemption", r); await reload(["settings"]); }, "Saved")}><Save size={13} /> Save</button>}>
      <div className="form-grid">
        <Field label="Age (years) and above"><input className="input" type="number" min={30} max={60} value={r.age ?? ""} onChange={(e) => setR({ ...r, age: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        <Field label="Medical category"><div className="row">{MEDICAL_CATEGORIES.filter((m) => m !== "A").map((m) => <label key={m} className="check"><input type="checkbox" checked={r.med_cats.includes(m)} onChange={(e) => toggle("med_cats", m, e.target.checked)} />{m}</label>)}</div></Field>
        <Field label="Exempted from" wide><div className="row">{trainingTypes.map((tp) => <label key={tp.id} className="check"><input type="checkbox" checked={r.tests.includes(tp.code)} onChange={(e) => toggle("tests", tp.code, e.target.checked)} />{tp.name}</label>)}</div></Field>
      </div>
    </Card>
  );
}
