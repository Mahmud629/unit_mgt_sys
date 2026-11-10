"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Download, Save, Trash2, Upload } from "lucide-react";
import { Alert, Badge, Card, Empty, Field, PageHeader, Select, SoldierPicker, Tabs, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { restoreRow, deleteTrainingRecord, listSoldiers, listTrainingRecords, saveTrainingRecords } from "@/lib/api";
import { autoExemption, resultLabel, resultOptions, seqName, seqOptions, suggestNext } from "@/lib/compute";
import { exportXlsx, parseDateCell, readSheet } from "@/lib/excel";
import { useSession } from "@/lib/session";
import type { TrainingRecord, TrainingResult } from "@/lib/types";
import { bdToday, currentYear, fmtDate, sortSoldiers, soldierLabel } from "@/lib/utils";

const RESULTS: TrainingResult[] = ["Pass", "Fail", "Ongoing", "Exempted", "Absent"];

export default function TrainingEntryPage() {
  const [tab, setTab] = useState<"quick" | "batch" | "import">("quick");
  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Record Results" />
      <Tabs tabs={[{ key: "quick", label: "Quick entry" }, { key: "batch", label: "Batch entry" }, { key: "import", label: "Excel import" }]} value={tab} onChange={setTab} />
      {tab === "quick" && <QuickEntry />}
      {tab === "batch" && <BatchEntry />}
      {tab === "import" && <ImportEntry />}
    </div>
  );
}

function useTypes() {
  const { trainingTypes } = useSession();
  return trainingTypes.filter((t) => t.active);
}

// ----------------------------------------------------------------- quick
function QuickEntry() {
  const types = useTypes();
  const { perms, directoryById } = useSession();
  const today = bdToday();
  const year = currentYear();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [soldierId, setSoldierId] = useState<string | null>(null);
  const [form, setForm] = useState({ sequence_no: "1", attempt_no: "1", test_date: today, result: "Pass", marks: "", grade: "", part1_no: "", remarks: "" });
  const [log, setLog] = useState<string[]>([]);
  const { busy, run } = useAction();
  const type = types.find((t) => t.id === typeId);
  const { data: recs, reload } = useAsync(async () => (soldierId ? listTrainingRecords({ soldierId, year }) : []), [soldierId]);

  function pick(id: string | null) {
    setSoldierId(id);
    if (!id || !type) return;
    void listTrainingRecords({ soldierId: id, year }).then((r) => {
      const n = suggestNext(type, r, Number(today.slice(5, 7)));
      setForm((f) => ({ ...f, sequence_no: String(n.sequence_no), attempt_no: String(n.attempt_no) }));
    });
  }
  async function save() {
    if (!soldierId || !type) return;
    const ok = await run(async () => {
      await saveTrainingRecords([{ soldier_id: soldierId, training_type_id: type.id, year, sequence_no: Number(form.sequence_no), attempt_no: Number(form.attempt_no), test_date: form.test_date || null, result: form.result as TrainingResult, marks: form.marks === "" ? null : Number(form.marks), grade: form.grade || null, part1_no: form.part1_no || null, remarks: form.remarks || null }]);
      return true;
    }, "Saved");
    if (ok) {
      setLog((l) => [`${soldierLabel(directoryById.get(soldierId))} — ${type.code} ${form.sequence_no}/${form.attempt_no}: ${resultLabel(type, form.result)}${form.marks ? ` (${form.marks})` : ""}`, ...l].slice(0, 12));
      setSoldierId(null);
      setForm((f) => ({ ...f, marks: "", remarks: "" }));
    }
  }
  const mine = (recs ?? []).filter((r) => r.training_type_id === typeId);

  return (
    <div className="grid grid-main">
      <Card title="Quick entry">
        <div className="form-grid">
          <Field label="Test / event" required><Select value={typeId} onChange={(v) => { setTypeId(v); setSoldierId(null); }} options={types.map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Date" required><input className="input" type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })} /></Field>
          <Field label="Soldier" wide required><SoldierPicker value={soldierId} onChange={(id) => pick(id)} filter={(s) => perms.canEditCompany(s.company_id)} /></Field>
          <Field label={type?.sequence_label ?? "No"}><Select value={form.sequence_no} onChange={(v) => setForm({ ...form, sequence_no: v })} options={seqOptions(type)} /></Field>
          <Field label="Attempt"><Select value={form.attempt_no} onChange={(v) => setForm({ ...form, attempt_no: v })} options={Array.from({ length: type?.max_attempts ?? 1 }, (_, i) => String(i + 1))} /></Field>
          <Field label="Result" required>
            <div className="seg" style={{ width: "100%" }}>{resultOptions(type).map((r) => <button key={r.value} type="button" style={{ flex: 1 }} className={form.result === r.value ? "on" : ""} onClick={() => setForm({ ...form, result: r.value })}>{r.label}</button>)}</div>
          </Field>
          {type?.has_marks && <Field label={`Marks${type.pass_mark ? ` (pass ${type.pass_mark})` : ""}`}><input className="input" type="number" value={form.marks} onChange={(e) => { const m = e.target.value; setForm({ ...form, marks: m, result: type.pass_mark && m !== "" ? (Number(m) >= type.pass_mark ? "Pass" : "Fail") : form.result }); }} /></Field>}
          <Field label="Grade / class"><input className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="optional" /></Field>
          <Field label="Part I Order No"><input className="input" value={form.part1_no} onChange={(e) => setForm({ ...form, part1_no: e.target.value })} /></Field>
          <Field label="Remarks" wide><input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder={form.result === "Fail" ? "e.g. failed item" : ""} /></Field>
        </div>
        <div className="row mt"><button className="btn btn-primary" disabled={busy || !soldierId} onClick={save} style={{ height: 42 }}><Save size={15} /> Save &amp; next</button></div>
        {soldierId && <div className="mt small">
          <strong>This year&apos;s {type?.name} records:</strong>{" "}
          {mine.length ? mine.sort((a, b) => a.sequence_no - b.sequence_no || a.attempt_no - b.attempt_no).map((r) => <Badge key={r.id} tone={r.result === "Pass" ? "green" : r.result === "Fail" ? "red" : "amber"}>{type ? seqName(type, r.sequence_no) : r.sequence_no}{r.attempt_no > 1 ? ` (att ${r.attempt_no})` : ""}: {resultLabel(type, r.result)}</Badge>) : <span className="muted">none</span>}
          {" "}<span className="muted">(suggested next: {type ? seqName(type, Number(form.sequence_no)) : ""}, attempt {form.attempt_no}; saving the same one again overwrites it)</span>
          {mine.length > 0 && <button className="btn btn-xs btn-ghost" onClick={reload}>refresh</button>}
        </div>}
      </Card>
      <Card title="Saved this session">{log.length === 0 ? <Empty>Entries you save appear here.</Empty> : log.map((l, i) => <div className="kv small" key={i}><span>{l}</span></div>)}</Card>
    </div>
  );
}

// ----------------------------------------------------------------- batch
function BatchEntry() {
  const types = useTypes();
  const { perms, myCompanies, directory } = useSession();
  const editable = myCompanies.filter((c) => perms.canEditCompany(c.id));
  const year = currentYear();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [coy, setCoy] = useState(editable[0]?.id ?? "");
  const [seq, setSeq] = useState("1");
  const [attempt, setAttempt] = useState("1");
  const [date, setDate] = useState(bdToday());
  const [part1, setPart1] = useState("");
  const [rows, setRows] = useState<Record<string, { result: string; marks: string; remarks: string }>>({});
  const { busy, run } = useAction();
  const type = types.find((t) => t.id === typeId);

  const { data: existing, reload } = useAsync(async () => (typeId ? listTrainingRecords({ year, typeId }) : []), [typeId]);
  const { data: full } = useAsync(() => listSoldiers().then((l) => new Map(l.map((x) => [x.id, x]))), []);
  const exempt = (sid: string) => { const x = full?.get(sid); return x && type ? autoExemption(type, x) : null; };
  const soldiers = useMemo(() => sortSoldiers(directory.filter((s) => s.status === "Serving" && s.company_id === coy && (!type || type.applies_to.includes(s.category)))), [directory, coy, type]);
  const existingFor = (sid: string) => (existing ?? []).find((r) => r.soldier_id === sid && r.sequence_no === Number(seq) && r.attempt_no === Number(attempt));
  const passedSeq = (sid: string) => (existing ?? []).some((r) => r.soldier_id === sid && r.sequence_no === Number(seq) && r.result === "Pass");
  const set = (sid: string, k: "result" | "marks" | "remarks", v: string) => setRows((r) => ({ ...r, [sid]: { ...{ result: "", marks: "", remarks: "" }, ...r[sid], [k]: v } }));
  const filled = Object.entries(rows).filter(([, v]) => v.result);

  async function saveAll() {
    if (!type) return;
    await run(async () => {
      await saveTrainingRecords(filled.map(([sid, v]) => ({ soldier_id: sid, training_type_id: type.id, year, sequence_no: Number(seq), attempt_no: Number(attempt), test_date: date || null, result: v.result as TrainingResult, marks: v.marks === "" ? null : Number(v.marks), part1_no: part1 || null, remarks: v.remarks || null })));
      setRows({});
      reload();
    }, `${filled.length} result(s) saved`);
  }

  return (
    <Card title="Batch entry" actions={<button className="btn btn-primary" disabled={busy || !filled.length} onClick={saveAll}><Save size={15} /> Save {filled.length || ""} result(s)</button>}>
      <div className="filters">
        <Field label="Test / event"><Select value={typeId} onChange={setTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Company"><Select value={coy} onChange={(v) => { setCoy(v); setRows({}); }} options={editable.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label={type?.sequence_label ?? "No"}><Select value={seq} onChange={setSeq} options={seqOptions(type)} /></Field>
        <Field label="Attempt"><Select value={attempt} onChange={setAttempt} options={Array.from({ length: type?.max_attempts ?? 1 }, (_, i) => String(i + 1))} /></Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Part I Order No"><input className="input" value={part1} onChange={(e) => setPart1(e.target.value)} /></Field>
      </div>
      <div className="row mt">
        <button className="btn btn-sm" onClick={() => setRows(Object.fromEntries(soldiers.filter((s) => !passedSeq(s.id) && !exempt(s.id)).map((s) => [s.id, { result: "Pass", marks: rows[s.id]?.marks ?? "", remarks: rows[s.id]?.remarks ?? "" }])))}><CheckCheck size={13} /> {type && resultLabel(type, "Pass") === "Completed" ? "Mark all not-yet-completed as Completed" : "Mark all not-yet-passed as Pass"}</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setRows({})}>Clear</button>
        <span className="muted small">Blank lines are skipped.</span>
      </div>
      {soldiers.length === 0 ? <Empty>No soldiers.</Empty> : (
        <div className="table-wrap tall mt"><table className="table compact">
          <thead><tr><th>#</th><th className="sticky-col">Soldier</th><th>Already recorded</th><th>Result</th>{type?.has_marks && <th>Marks</th>}<th>Remarks</th></tr></thead>
          <tbody>{soldiers.map((s, i) => {
            const ex = existingFor(s.id);
            return (
              <tr key={s.id}>
                <td className="muted">{i + 1}</td>
                <td className="sticky-col"><div className="who"><strong>{s.rank} {s.name}</strong><span>{s.snk_no}</span></div></td>
                <td>{ex ? <Badge tone={ex.result === "Pass" ? "green" : ex.result === "Fail" ? "red" : "amber"}>{resultLabel(type, ex.result)}{ex.marks !== null ? ` ${ex.marks}` : ""}</Badge> : passedSeq(s.id) ? <Badge tone="green">{resultLabel(type, "Pass")} (other attempt)</Badge> : exempt(s.id) ? <Badge tone="amber">Exempted · {exempt(s.id)}</Badge> : <span className="muted small">—</span>}</td>
                <td><select className="input input-sm" style={{ width: 120 }} value={rows[s.id]?.result ?? ""} onChange={(e) => set(s.id, "result", e.target.value)}><option value="">—</option>{resultOptions(type).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></td>
                {type?.has_marks && <td><input className="input input-sm" type="number" style={{ width: 90 }} value={rows[s.id]?.marks ?? ""} onChange={(e) => { set(s.id, "marks", e.target.value); if (type.pass_mark && e.target.value !== "") set(s.id, "result", Number(e.target.value) >= type.pass_mark ? "Pass" : "Fail"); }} /></td>}
                <td><input className="input input-sm" value={rows[s.id]?.remarks ?? ""} onChange={(e) => set(s.id, "remarks", e.target.value)} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <RecentRecords records={existing ?? []} reload={reload} />
    </Card>
  );
}

function RecentRecords({ records, reload }: { records: TrainingRecord[]; reload: () => void }) {
  const { directoryById, perms, trainingTypes } = useSession();
  const { run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const [open, setOpen] = useState(false);
  const list = records.filter((r) => perms.canViewCompany(r.company_id)).sort((a, b) => String(b.test_date).localeCompare(String(a.test_date))).slice(0, 100);
  return (
    <div className="mt">
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} recorded results ({records.length})</button>
      {open && <div className="table-wrap mt" style={{ maxHeight: 360 }}><table className="table compact">
        <thead><tr><th>Date</th><th>Soldier</th><th>Event</th><th>Result</th><th>Part I</th><th /></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}><td>{fmtDate(r.test_date)}</td><td>{soldierLabel(directoryById.get(r.soldier_id))}</td><td>{(() => { const t = trainingTypes.find((x) => x.id === r.training_type_id); return t ? `${t.code} · ${seqName(t, r.sequence_no)}${r.attempt_no > 1 ? ` (att ${r.attempt_no})` : ""}` : ""; })()}</td><td>{resultLabel(trainingTypes.find((x) => x.id === r.training_type_id), r.result)}{r.marks !== null ? ` (${r.marks})` : ""}</td><td>{r.part1_no}</td>
            <td>{perms.canEditCompany(r.company_id) && <button className="btn btn-xs btn-ghost" onClick={() => undoable({ text: "Result deleted", act: () => deleteTrainingRecord(r.id), undo: () => restoreRow("training_records", r), after: reload })}><Trash2 size={12} /></button>}</td></tr>
        ))}</tbody>
      </table></div>}
    </div>
  );
}

// ---------------------------------------------------------------- import
type Parsed = { row: number; ok: boolean; error?: string; rec?: Partial<TrainingRecord>; label?: string };
function ImportEntry() {
  const types = useTypes();
  const { directory, perms } = useSession();
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const { busy, run } = useAction();
  const bySnk = useMemo(() => new Map(directory.map((s) => [s.snk_no.replace(/\s+/g, "").toLowerCase(), s])), [directory]);

  async function template() {
    await exportXlsx("Training_Import_Template", [
      { name: "Results", rows: [{ personal_no: "4012345", event: "IPFT", year: currentYear(), sequence: 1, attempt: 1, date: bdToday(), result: "Pass", marks: "", grade: "", part1_no: "P1/xx", remarks: "" }, { personal_no: "4012346", event: "RET", year: currentYear(), sequence: 1, attempt: 1, date: bdToday(), result: "Pass", marks: 78, grade: "1st Class", part1_no: "", remarks: "" }] },
      { name: "Events", rows: types.map((t) => ({ event: t.code, name: t.name, "sequence (number or name)": seqOptions(t).map((o) => `${o.value} = ${o.label}`).join(", "), "max attempt": t.max_attempts })) },
      { name: "Help", rows: [{ Column: "result", Values: RESULTS.join(", ") + " (Group Training: Completed, Ongoing, Fail = Yet to complete)" }, { Column: "date", Values: "YYYY-MM-DD, DD/MM/YYYY or 15-Mar-2026" }] },
    ]);
  }
  async function onFile(file?: File) {
    if (!file) return;
    await run(async () => {
      const rows = await readSheet(file);
      setParsed(rows.map((r, i): Parsed => {
        const s = bySnk.get(String(r.personal_no ?? r.snk_no ?? r.no ?? "").replace(/\s+/g, "").toLowerCase());
        const t = types.find((x) => x.code.toLowerCase() === String(r.event ?? r.type ?? "").toLowerCase() || x.name.toLowerCase() === String(r.event ?? "").toLowerCase());
        const result = RESULTS.find((x) => x.toLowerCase() === String(r.result ?? "").toLowerCase() || (x === "Pass" && /^(p|qualified|completed)$/i.test(r.result ?? "")) || (x === "Fail" && /^(f|failed|not ?completed|incomplete|yet to complete)$/i.test(r.result ?? "")) || (x === "Ongoing" && /^(on ?going|in progress)$/i.test(r.result ?? "")));
        const seqRaw = String(r.sequence || r.period || r.march_no || "1");
        const seq = t ? Number(seqOptions(t).find((o) => o.label.toLowerCase() === seqRaw.toLowerCase())?.value ?? seqRaw) : Number(seqRaw);
        const att = Number(r.attempt || 1);
        const err = !s ? "Personal No not found" : !perms.canEditCompany(s.company_id) ? "Not your company" : !t ? "Unknown event" : !result ? "Bad result" : !(seq >= 1 && seq <= t.frequency) ? `${t.sequence_label} must be 1–${t.frequency} or a name like "${seqName(t, 1)}"` : att < 1 || att > t.max_attempts ? `Attempt must be 1–${t.max_attempts}` : undefined;
        if (err) return { row: i + 2, ok: false, error: err, label: `${r.personal_no ?? ""} ${r.event ?? ""}` };
        return { row: i + 2, ok: true, label: `${s!.snk_no} ${s!.rank} ${s!.name} — ${t!.code} ${seqName(t!, seq)}${att > 1 ? ` att ${att}` : ""}: ${resultLabel(t, result!)}`, rec: { soldier_id: s!.id, training_type_id: t!.id, year: Number(r.year || currentYear()), sequence_no: seq, attempt_no: att, test_date: parseDateCell(r.date ?? "") || null, result: result!, marks: r.marks ? Number(r.marks) : null, grade: r.grade || null, part1_no: r.part1_no || null, remarks: r.remarks || null } };
      }));
    });
  }
  const good = parsed?.filter((p) => p.ok) ?? [];
  return (
    <Card title="Import results from Excel / CSV" actions={<button className="btn btn-sm" onClick={template}><Download size={13} /> Download template</button>}>
      <Alert tone="blue">Columns: <span className="mono">personal_no, event, year, sequence, attempt, date, result, marks, grade, part1_no, remarks</span>. Event is the code (e.g. IPFT, RET, SM). Rows are checked against the soldiers database before anything is saved.</Alert>
      <label className="btn btn-primary"><Upload size={15} /> Choose file<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      {parsed && (
        <div className="mt">
          <div className="row-between"><span><strong>{good.length}</strong> valid · <strong style={{ color: "var(--red)" }}>{parsed.length - good.length}</strong> with errors</span>
            <button className="btn btn-green" disabled={busy || !good.length} onClick={() => run(async () => { await saveTrainingRecords(good.map((g) => g.rec!)); setParsed(null); }, `${good.length} result(s) imported`)}>Import {good.length} valid row(s)</button></div>
          <div className="table-wrap mt" style={{ maxHeight: 420 }}><table className="table compact"><thead><tr><th>Row</th><th>Record</th><th>Check</th></tr></thead>
            <tbody>{parsed.map((p) => <tr key={p.row} className={p.ok ? undefined : "row-highlight"}><td>{p.row}</td><td>{p.label}</td><td>{p.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">{p.error}</Badge>}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </Card>
  );
}
