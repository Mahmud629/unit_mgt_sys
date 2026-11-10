"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileText, Plus, Search, Trash2 } from "lucide-react";
import { exportObjectsPdf } from "@/lib/pdf";
import { Alert, Badge, Card, CompanySelect, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, SoldierPicker, Stat, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { restoreRow, deleteCourse, listCourses, saveCourse } from "@/lib/api";
import { exportXlsx } from "@/lib/excel";
import { useSession } from "@/lib/session";
import type { CourseNomination } from "@/lib/types";
import { bdToday, fmtDate, soldierLabel, fmtDateFull } from "@/lib/utils";

const STATUSES = ["Nominated", "Attending", "Completed", "Failed", "Withdrawn"];
const TONE: Record<string, string> = { Nominated: "amber", Attending: "blue", Completed: "green", Failed: "red", Withdrawn: "grey" };

export default function CoursesPage() {
  const { perms, directoryById, companyById, settings } = useSession();
  const today = bdToday();
  const { data, error, loading, reload } = useAsync(() => listCourses(), []);
  const [status, setStatus] = useState("active");
  const [coy, setCoy] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<CourseNomination> | null>(null);
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();

  const rows = useMemo(() => (data ?? []).filter((c) => perms.canViewCompany(c.company_id) && (!coy || c.company_id === coy)
    && (status === "active" ? ["Nominated", "Attending"].includes(c.status) : !status || c.status === status)
    && (!q || `${soldierLabel(directoryById.get(c.soldier_id))} ${c.course_name} ${c.institution}`.toLowerCase().includes(q.toLowerCase()))), [data, perms, coy, status, q, directoryById]);
  const all = (data ?? []).filter((c) => perms.canViewCompany(c.company_id));

  async function save() {
    if (!edit) return;
    await run(async () => { await saveCourse(edit); setEdit(null); reload(); }, "Saved");
  }

  const courseRows = () => rows.map((c, i) => { const s = directoryById.get(c.soldier_id); return { Ser: i + 1, "Personal No": s?.snk_no ?? "", Rank: s?.rank ?? "", Name: s?.name ?? "", Coy: companyById.get(c.company_id ?? "")?.short_name ?? "", Course: c.course_name, Institution: c.institution ?? "", Type: c.course_type, From: c.from_date ?? "", To: c.to_date ?? "", Status: c.status, Result: c.result ?? "", Grade: c.grade ?? "" }; });

  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Courses & Cadres"
        actions={<>
          <button className="btn" onClick={() => exportXlsx(`Courses_${today}`, [{ name: "Courses", rows: courseRows() }])}><Download size={15} /> Excel</button>
          <button className="btn" disabled={!rows.length} onClick={() => exportObjectsPdf({ filename: `Courses_${today}`, unit: settings.unit.name, title: "Courses & Cadres", orientation: "landscape", chips: [{ label: "Nominations", value: String(rows.length), color: "#7a5bc7" }], rows: courseRows().map((r) => ({ ...r, From: fmtDateFull(r.From), To: fmtDateFull(r.To) })) })}><FileText size={15} /> PDF</button>
          {perms.canEditAnyCompany && <button className="btn btn-primary" onClick={() => setEdit({ course_type: "External", status: "Nominated", from_date: today })}><Plus size={15} /> Nominate</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      <div className="stats">
        <Stat label="On external course now" value={all.filter((c) => c.course_type === "External" && ["Nominated", "Attending"].includes(c.status) && c.from_date && c.from_date <= today && (c.to_date ?? c.from_date) >= today).length} tone="blue" onClick={() => setStatus("Attending")} />
        <Stat label="In unit cadres now" value={all.filter((c) => c.course_type === "Internal" && ["Nominated", "Attending"].includes(c.status) && c.from_date && c.from_date <= today && (c.to_date ?? c.from_date) >= today).length} tone="green" />
        <Stat label="Nominated (upcoming)" value={all.filter((c) => c.status === "Nominated" && (c.from_date ?? "") > today).length} tone="amber" onClick={() => setStatus("Nominated")} />
        <Stat label="Completed this year" value={all.filter((c) => c.status === "Completed" && (c.to_date ?? "").startsWith(today.slice(0, 4))).length} onClick={() => setStatus("Completed")} />
      </div>
      <div className="toolbar">
        <div className="search"><Search size={15} /><input className="input" placeholder="Search soldier or course…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={status} onChange={setStatus} placeholder="Any status" options={[{ value: "active", label: "Nominated + Attending" }, ...STATUSES]} />
        {perms.canViewAll && <CompanySelect value={coy} onChange={setCoy} />}
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No courses in this view.</Empty> : (
          <div className="table-wrap tall"><table className="table">
            <thead><tr><th>Soldier</th><th>Course</th><th>Institution</th><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Result</th><th /></tr></thead>
            <tbody>{rows.map((c) => {
              const s = directoryById.get(c.soldier_id);
              return (
                <tr key={c.id}>
                  <td><div className="who"><Link className="link" href={`/soldiers/view?id=${c.soldier_id}`}>{s?.rank} {s?.name}</Link><span>{s?.snk_no} · {companyById.get(c.company_id ?? "")?.short_name}</span></div></td>
                  <td className="strong">{c.course_name}</td><td>{c.institution}</td><td>{c.course_type}</td><td className="nowrap">{fmtDate(c.from_date)}</td><td className="nowrap">{fmtDate(c.to_date)}</td>
                  <td><Badge tone={TONE[c.status]}>{c.status}</Badge></td><td>{[c.result, c.grade].filter(Boolean).join(" / ")}</td>
                  <td className="nowrap">{perms.canEditCompany(c.company_id) && <><button className="btn btn-xs btn-ghost" onClick={() => setEdit(c)}>Edit</button><button className="btn btn-xs btn-ghost" onClick={() => undoable({ text: "Nomination deleted", act: () => deleteCourse(c.id), undo: () => restoreRow("course_nominations", c), after: reload })}><Trash2 size={12} /></button></>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit course" : "Nominate for course / cadre"}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !edit?.soldier_id || !edit?.course_name} onClick={save}>Save</button></>}>
        {edit && <div className="form-grid">
          <Field label="Soldier" wide required>{edit.id ? <input className="input" disabled value={soldierLabel(directoryById.get(edit.soldier_id!))} /> : <SoldierPicker value={edit.soldier_id ?? null} onChange={(id) => setEdit({ ...edit, soldier_id: id ?? undefined })} filter={(s) => perms.canEditCompany(s.company_id)} />}</Field>
          <Field label="Course / cadre" wide required><input className="input" value={edit.course_name ?? ""} onChange={(e) => setEdit({ ...edit, course_name: e.target.value })} /></Field>
          <Field label="Institution"><input className="input" value={edit.institution ?? ""} onChange={(e) => setEdit({ ...edit, institution: e.target.value })} placeholder="SST&S, Unit…" /></Field>
          <Field label="Type" hint="External = absent from unit"><Select value={edit.course_type} onChange={(v) => setEdit({ ...edit, course_type: v as CourseNomination["course_type"] })} options={["External", "Internal"]} /></Field>
          <Field label="From"><input className="input" type="date" value={edit.from_date ?? ""} onChange={(e) => setEdit({ ...edit, from_date: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={edit.to_date ?? ""} min={edit.from_date ?? undefined} onChange={(e) => setEdit({ ...edit, to_date: e.target.value })} /></Field>
          <Field label="Status"><Select value={edit.status} onChange={(v) => setEdit({ ...edit, status: v as CourseNomination["status"] })} options={STATUSES} /></Field>
          <Field label="Result"><input className="input" value={edit.result ?? ""} onChange={(e) => setEdit({ ...edit, result: e.target.value })} placeholder="Qualified…" /></Field>
          <Field label="Grade"><input className="input" value={edit.grade ?? ""} onChange={(e) => setEdit({ ...edit, grade: e.target.value })} /></Field>
          <Field label="Part I Order No"><input className="input" value={edit.part1_no ?? ""} onChange={(e) => setEdit({ ...edit, part1_no: e.target.value })} /></Field>
          <Field label="Remarks" wide><input className="input" value={edit.remarks ?? ""} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
