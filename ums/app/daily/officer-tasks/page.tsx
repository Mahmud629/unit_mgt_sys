"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Download, FileText, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat, useAction, useAsync, useUndo } from "@/components/ui";
import { deleteOfficerTask, listOfficerTasks, restoreRow, saveOfficerTask } from "@/lib/api";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_COLOR, taskState } from "@/lib/constants";
import { exportXlsx } from "@/lib/excel";
import { useI18n } from "@/lib/i18n";
import { exportReportPdf } from "@/lib/pdf";
import { useSession } from "@/lib/session";
import type { DirectoryEntry, OfficerTask, TaskStatus } from "@/lib/types";
import { bdToday, cls, fmtDate } from "@/lib/utils";

const HEADER_COLORS = ["#1c3d57", "#4f6f52", "#7a3b3b", "#2c6e7f", "#6d4fb3", "#8a5a1f", "#2f669f", "#5b7083", "#a5462f", "#3b6b4a", "#6b4a7a", "#2c8c99"];
const catColor = (c: string) => TASK_CATEGORIES.find((x) => x.name === c)?.color ?? "#6b7a86";

/** Officers' tasks: one card per officer, a details drawer and the full task list. */
export default function OfficerTasksPage() {
  const { perms, profile, directory, settings, companyById } = useSession();
  const { t, nameOf } = useI18n();
  const today = bdToday();
  const { data, error, loading, reload } = useAsync(listOfficerTasks, []);
  const [edit, setEdit] = useState<Partial<OfficerTask> | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const [who, setWho] = useState("");
  const { busy, run } = useAction();
  const undoable = useUndo();

  const rankIdx = (d: DirectoryEntry) => { const i = (settings.ranks.Offr ?? []).indexOf(d.rank); return i < 0 ? 99 : i; };
  const officers = useMemo(() => directory.filter((d) => d.category === "Offr" && d.status === "Serving").sort((a, b) => rankIdx(a) - rankIdx(b) || a.display_order - b.display_order), // eslint-disable-line react-hooks/exhaustive-deps
    [directory, settings]);
  const mine = [profile.soldier_id, profile.held_by_soldier].filter(Boolean) as string[];
  const canEdit = perms.isSuper;
  const canStatus = (task: OfficerTask) => perms.isSuper || task.assigned_to.some((x) => mine.includes(x));
  const tasks = data ?? [];
  const tasksOf = (sid: string) => tasks.filter((x) => x.assigned_to.includes(sid));
  const open = tasks.filter((x) => x.status !== "Completed");
  const state = (x: OfficerTask) => taskState(x, today);

  const filtered = tasks.filter((x) => (!status || state(x) === status) && (!cat || x.category === cat) && (!who || x.assigned_to.includes(who)) &&
    (!q || `${x.title} ${x.details ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(a.status === "Completed") - Number(b.status === "Completed") || String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")));
  const names = (ids: string[]) => ids.map((id) => { const d = directory.find((x) => x.id === id); return d ? `${d.rank} ${d.name}` : ""; }).filter(Boolean).join(", ");

  async function setTaskStatus(task: OfficerTask, s: TaskStatus) {
    await run(async () => { await saveOfficerTask({ id: task.id, status: s }); await reload(); }, `${t(s)}`);
  }
  const removeTask = (task: OfficerTask) => undoable({ text: "Task deleted", act: () => deleteOfficerTask(task.id), undo: () => restoreRow("officer_tasks", task), after: reload });
  const outRows = () => filtered.map((x, i) => ({ Ser: i + 1, Task: x.title, Officers: names(x.assigned_to), Category: x.category, Priority: x.priority, Deadline: x.deadline ?? "", Status: state(x), Remarks: x.remarks ?? "" }));

  if (!perms.isOfficer) return <div className="page"><Alert tone="red">{t("Officers' tasks are for officers only.")}</Alert></div>;
  return (
    <div className="page">
      <PageHeader eyebrow="Officers" title="Officers' Tasks" subtitle="Responsibilities with a deadline — the Adjt (2IC / CO) assigns them, each officer updates his own."
        actions={<>
          <button className="btn" onClick={() => exportXlsx(`Officers_Tasks_${today}`, [{ name: "Tasks", rows: outRows() }])}><Download size={15} /> Excel</button>
          <button className="btn" onClick={() => run(() => exportReportPdf({
            filename: `Officers_Tasks_${today}`, unit: settings.unit.name, title: "Officers' Tasks", orientation: "landscape", subtitle: `As on ${fmtDate(today)}`,
            chips: ["Pending", "In Progress", "Overdue", "On Hold", "Completed"].map((s) => ({ label: s, value: String(tasks.filter((x) => state(x) === s).length), color: TASK_STATUS_COLOR[s] })),
            sections: officers.filter((o) => tasksOf(o.id).length).map((o, i) => ({
              title: `${o.rank} ${o.name}`, color: HEADER_COLORS[i % HEADER_COLORS.length],
              columns: [{ header: "Task", key: "task" }, { header: "Category", key: "cat" }, { header: "Priority", key: "pri" }, { header: "Deadline", key: "dl" }, { header: "Status", key: "st" }, { header: "Remarks", key: "rmk" }],
              rows: tasksOf(o.id).map((x) => ({ task: x.title, cat: x.category, pri: x.priority, dl: fmtDate(x.deadline), st: state(x), rmk: x.remarks ?? "" })),
              colorize: (k, v) => (k === "st" ? TASK_STATUS_COLOR[v] ?? null : null),
            })),
          }), "PDF downloaded")}><FileText size={15} /> PDF</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setEdit({ status: "Pending", priority: "Normal", category: "Admin", assigned_to: [] })}><Plus size={15} /> {t("Add task")}</button>}
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <div className="stats">
            <Stat label="Open tasks" value={open.length} tone="navy" onClick={() => setStatus("")} />
            <Stat label="Pending" value={tasks.filter((x) => state(x) === "Pending").length} tone="amber" onClick={() => setStatus("Pending")} />
            <Stat label="In Progress" value={tasks.filter((x) => state(x) === "In Progress").length} tone="blue" onClick={() => setStatus("In Progress")} />
            <Stat label="Overdue" value={tasks.filter((x) => state(x) === "Overdue").length} tone="red" onClick={() => setStatus("Overdue")} />
            <Stat label="Completed" value={tasks.filter((x) => x.status === "Completed").length} tone="green" onClick={() => setStatus("Completed")} />
          </div>

          {/* one card per officer — cards grow with their tasks (no inner scroll) */}
          <div className="offr-grid">
            {officers.map((o, i) => {
              const list = tasksOf(o.id).filter((x) => x.status !== "Completed").sort((a, b) => String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")));
              const isOpen = !collapsed.has(o.id);
              return (
                <section key={o.id} className="offr-card">
                  <div className="offr-head" style={{ background: HEADER_COLORS[i % HEADER_COLORS.length] }}>
                    <button type="button" className="offr-id" onClick={() => setDrawer(o.id)} title={t("Officer details")}>
                      <UserRound size={17} /><span><strong>{o.rank} {nameOf(o)}</strong><small>{[o.appointment, companyById.get(o.company_id)?.short_name].filter(Boolean).join(" · ")}</small></span>
                    </button>
                    <div className="offr-actions">
                      {canEdit && <button type="button" className="offr-btn" aria-label={t("Add task")} title={t("Add task")} onClick={(e) => { e.stopPropagation(); setEdit({ status: "Pending", priority: "Normal", category: "Admin", assigned_to: [o.id] }); }}><Plus size={16} /></button>}
                      <button type="button" className="offr-btn ghost" aria-label={isOpen ? "Collapse" : "Expand"} onClick={(e) => { e.stopPropagation(); setCollapsed((c) => { const n = new Set(c); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; }); }}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                    </div>
                  </div>
                  {isOpen && list.length > 0 && (
                    <ul className="offr-tasks">
                      {list.map((x) => { const st = state(x); return (
                        <li key={x.id} onClick={() => setDrawer(o.id)}>
                          <i style={{ background: catColor(x.category) }} title={x.category} />
                          <span className="offr-task-title">{x.title}</span>
                          <span className="offr-task-meta"><CalendarDays size={12} /> {x.deadline ? fmtDate(x.deadline, false) : "—"}</span>
                          <span className="task-badge" style={{ ["--c" as string]: TASK_STATUS_COLOR[st] }}>{t(st)}</span>
                        </li>
                      ); })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <Card title="All tasks" pad={false} className="mt">
            <div className="toolbar" style={{ padding: "12px 14px 0" }}>
              <div className="search grow"><Search size={15} /><input className="input" placeholder={t("Search task…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Select value={who} onChange={setWho} placeholder="All officers" options={officers.map((o) => ({ value: o.id, label: `${o.rank} ${o.name}` }))} />
              <Select value={status} onChange={setStatus} placeholder="Any status" options={["Pending", "In Progress", "Overdue", "On Hold", "Completed"]} />
              <Select value={cat} onChange={setCat} placeholder="All categories" options={TASK_CATEGORIES.map((c) => c.name)} />
            </div>
            {filtered.length === 0 ? <Empty>No task in this view.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>#</th><th>Task</th><th>Officers</th><th>Category</th><th>Priority</th><th>Deadline</th><th>Status</th><th className="right" /></tr></thead>
                <tbody>{filtered.map((x, i) => { const st = state(x); return (
                  <tr key={x.id} className={st === "Overdue" ? "row-highlight" : x.status === "Completed" ? "row-muted" : undefined}>
                    <td className="muted">{i + 1}</td>
                    <td><strong>{x.title}</strong>{x.details && <div className="small muted">{x.details}</div>}</td>
                    <td className="small">{names(x.assigned_to) || "—"}</td>
                    <td><span className="cat-tag" style={{ ["--c" as string]: catColor(x.category) }}>{t(x.category)}</span></td>
                    <td><Badge tone={x.priority === "Urgent" ? "red" : x.priority === "High" ? "amber" : "grey"}>{x.priority}</Badge></td>
                    <td className="nowrap">{fmtDate(x.deadline) || "—"}</td>
                    <td>{canStatus(x)
                      ? <select className="input input-sm task-select" style={{ ["--c" as string]: TASK_STATUS_COLOR[st] }} value={x.status} disabled={busy} onChange={(e) => setTaskStatus(x, e.target.value as TaskStatus)}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
                      : <span className="task-badge" style={{ ["--c" as string]: TASK_STATUS_COLOR[st] }}>{t(st)}</span>}
                      {st === "Overdue" && canStatus(x) && <div className="small" style={{ color: TASK_STATUS_COLOR.Overdue }}>{t("Overdue")}</div>}</td>
                    <td className="right nowrap">{canEdit && <><button className="btn btn-xs btn-ghost" onClick={() => setEdit(x)} aria-label="Edit"><Pencil size={12} /></button><button className="btn btn-xs btn-ghost" onClick={() => removeTask(x)} aria-label="Delete"><Trash2 size={12} /></button></>}</td>
                  </tr>
                ); })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {drawer && <OfficerDrawer officerId={drawer} tasks={tasksOf(drawer)} canEdit={canEdit} canStatus={canStatus} busy={busy}
        onClose={() => setDrawer(null)} onAdd={() => setEdit({ status: "Pending", priority: "Normal", category: "Admin", assigned_to: [drawer] })} onEdit={(x) => setEdit(x)} onStatus={setTaskStatus} />}
      {edit && <TaskModal value={edit} officers={officers} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

/** Officer Responsibility Details — dark green drawer with gold accents (reused from cards and the table). */
function OfficerDrawer({ officerId, tasks, canEdit, canStatus, busy, onClose, onAdd, onEdit, onStatus }: {
  officerId: string; tasks: OfficerTask[]; canEdit: boolean; canStatus: (t: OfficerTask) => boolean; busy: boolean;
  onClose: () => void; onAdd: () => void; onEdit: (t: OfficerTask) => void; onStatus: (t: OfficerTask, s: TaskStatus) => void;
}) {
  const { directoryById, companyById } = useSession();
  const { t, nameOf } = useI18n();
  const today = bdToday();
  const o = directoryById.get(officerId);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!o) return null;
  const list = [...tasks].sort((a, b) => Number(a.status === "Completed") - Number(b.status === "Completed") || String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")));
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="offr-drawer" role="dialog" aria-label={`${o.rank} ${o.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="od-head">
          <div><h2>{o.rank.toUpperCase()} {nameOf(o).toUpperCase()}</h2><p>{t("Officer Responsibility Details")}</p></div>
          <span className="od-icon"><UserRound size={22} /></span>
          <button type="button" className="od-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="od-info">
          <span className={o.status === "Serving" ? "od-badge on" : "od-badge"}>{o.status === "Serving" ? t("Active") : t(o.status)}</span>
          <span>{o.appointment || "—"}</span><span>{companyById.get(o.company_id)?.short_name ?? "—"}</span>
        </div>
        <h3 className="od-title">{t("Assigned Tasks")} <small>{tasks.filter((x) => x.status !== "Completed").length} {t("open")}</small></h3>
        <div className="od-body">
          {list.length === 0 ? <p className="od-empty">{t("No task assigned.")}</p> : list.map((x, i) => {
            const st = taskState(x, today);
            return (
              <div key={x.id} className="od-task">
                <div className="od-row1">
                  <span className="od-ser">{i + 1}.</span><strong>{x.title}</strong>
                  <span className="task-badge" style={{ ["--c" as string]: TASK_STATUS_COLOR[st] }}>{t(st)}</span>
                </div>
                <div className="od-row2">
                  <span><CalendarDays size={13} /> {x.deadline ? fmtDate(x.deadline) : t("No deadline")}</span>
                  <span className="od-cat" style={{ ["--c" as string]: catColor(x.category) }}>{t(x.category)}</span>
                  {x.priority !== "Normal" && <span className={cls("od-pri", x.priority === "Urgent" && "urgent")}>{t(x.priority)}</span>}
                  <span className="od-tools">
                    {canStatus(x) && <select className="od-select" value={x.status} disabled={busy} onChange={(e) => onStatus(x, e.target.value as TaskStatus)} aria-label="Status">{TASK_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>}
                    {canEdit && <button type="button" className="od-edit" onClick={() => onEdit(x)} aria-label="Edit"><Pencil size={13} /></button>}
                  </span>
                </div>
                {x.details && <p className="od-details">{x.details}</p>}
              </div>
            );
          })}
        </div>
        {canEdit && <footer className="od-foot"><button type="button" className="od-add" onClick={onAdd}><Plus size={16} /> {t("Add task")}</button></footer>}
      </aside>
    </div>
  );
}

function TaskModal({ value, officers, onClose, onDone }: { value: Partial<OfficerTask>; officers: DirectoryEntry[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [v, setV] = useState<Partial<OfficerTask>>(value);
  const [pick, setPick] = useState("");
  const { busy, run } = useAction();
  const set = <K extends keyof OfficerTask>(k: K, x: OfficerTask[K]) => setV((cur) => ({ ...cur, [k]: x }));
  const assigned = v.assigned_to ?? [];
  return (
    <Modal open wide onClose={onClose} title={v.id ? t("Edit task") : t("Add task")}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !v.title?.trim() || !assigned.length}
        onClick={() => run(async () => { await saveOfficerTask({ ...v, title: v.title!.trim(), details: v.details || null, remarks: v.remarks || null, deadline: v.deadline || null }); onDone(); }, "Saved")}>Save</button></>}>
      <div className="form-grid">
        <Field label="Task" required wide><input className="input" value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Prepare inquiry report" autoFocus /></Field>
        <Field label="Officers" required wide hint="One task can be given to more than one officer">
          <div className="officer-chips">
            {assigned.map((id) => { const o = officers.find((x) => x.id === id); return <span key={id} className="chip">{o ? `${o.rank} ${o.name}` : id}<button type="button" onClick={() => set("assigned_to", assigned.filter((x) => x !== id))} aria-label="Remove"><X size={11} /></button></span>; })}
            <select className="input input-sm" value={pick} onChange={(e) => { if (e.target.value) set("assigned_to", [...assigned, e.target.value]); setPick(""); }}>
              <option value="">{t("+ Add officer…")}</option>
              {officers.filter((o) => !assigned.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.rank} {o.name}{o.appointment ? ` (${o.appointment})` : ""}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Category"><Select value={v.category} onChange={(x) => set("category", x)} options={TASK_CATEGORIES.map((c) => c.name)} /></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(x) => set("priority", x as OfficerTask["priority"])} options={[...TASK_PRIORITIES]} /></Field>
        <Field label="Deadline"><input className="input" type="date" value={v.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} /></Field>
        <Field label="Status"><Select value={v.status} onChange={(x) => set("status", x as TaskStatus)} options={[...TASK_STATUSES]} /></Field>
        <Field label="Details" wide><textarea className="input" rows={3} value={v.details ?? ""} onChange={(e) => set("details", e.target.value)} /></Field>
        <Field label="Remarks" wide><input className="input" value={v.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
