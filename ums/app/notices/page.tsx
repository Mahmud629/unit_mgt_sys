"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Image as ImageIcon, Megaphone, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Tabs, useAction, useAsync, useConfirm, useUndo } from "@/components/ui";
import { NOTICE_FILE_MAX, restoreRow, deleteNotice, listNotices, noticeFileUrl, openNoticeFile, saveNotice, uploadNoticeFile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Notice, NoticeFile } from "@/lib/types";
import { bdToday, fmtDate } from "@/lib/utils";

export default function NoticesPage() {
  const { perms, myCompanies, companyById, profile, settings } = useSession();
  const today = bdToday();
  const [tab, setTab] = useState<"current" | "archive">("current");
  const [edit, setEdit] = useState<Partial<Notice> | null>(null);
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const undoable = useUndo();
  const { data, error, loading, reload } = useAsync(listNotices, []);
  const { t } = useI18n();

  const canPublishAny = perms.isCommand || perms.role === "coy_comd" || perms.isClerk;
  // the Clerk publishes on behalf of an officer: "By order of Adjt"
  const issuers = [...new Set([...(settings.officer_appointments ?? []), "CO", "2IC", "Adjt", "QM", "Coy Comd"])];
  const rows = useMemo(() => (data ?? []).filter((n) => (tab === "current" ? n.publish_date <= today && (!n.expiry_date || n.expiry_date >= today) : n.expiry_date && n.expiry_date < today) || (tab === "current" && n.publish_date > today && perms.canPublishNotice(n.company_id))), [data, tab, today, perms]);
  const sorted = [...rows].sort((a, b) => ({ Urgent: 0, Important: 1, Normal: 2 }[a.priority] - { Urgent: 0, Important: 1, Normal: 2 }[b.priority]) || b.publish_date.localeCompare(a.publish_date));

  return (
    <div className="page notices-page">
      <PageHeader eyebrow="Administration" title="Notices & Orders"
        actions={canPublishAny && <button className="btn btn-primary" onClick={() => setEdit({ category: "Notice", priority: "Normal", publish_date: today, company_id: perms.canEditUnitActivities ? null : profile.company_id, issued_by: perms.isClerk ? "Adjt" : null })}><Plus size={15} /> Publish</button>} />
      <Tabs tabs={[{ key: "current", label: "Current" }, { key: "archive", label: "Expired" }]} value={tab} onChange={setTab} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : sorted.length === 0 ? <Card><Empty icon={<Megaphone size={22} />}>No notices.</Empty></Card> : (
        <div className="stack">
          {sorted.map((n) => (
            <Card key={n.id} className={n.priority === "Urgent" ? "notice-urgent" : n.priority === "Important" ? "notice-important" : undefined}
              title={<>{n.title} {n.priority !== "Normal" && <Badge tone={n.priority === "Urgent" ? "red" : "amber"}>{n.priority}</Badge>} {n.publish_date > today && <Badge tone="blue">Scheduled {fmtDate(n.publish_date)}</Badge>}</>}
              actions={<><span className="small muted">{n.issued_by && <>{t("By order of")} <strong>{n.issued_by}</strong> · </>}{n.category} · {n.company_id ? companyById.get(n.company_id)?.name : "All ranks"} · {fmtDate(n.publish_date)}{n.expiry_date ? ` → ${fmtDate(n.expiry_date)}` : ""}</span>
                {perms.canPublishNotice(n.company_id) && <><button className="btn btn-xs btn-ghost" onClick={() => setEdit(n)}>Edit</button><button className="btn btn-xs btn-ghost" onClick={() => undoable({ text: "Notice deleted", act: () => deleteNotice(n.id), undo: () => restoreRow("notices", n), after: reload })}><Trash2 size={12} /></button></>}</>}>
              {n.body && <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.body}</div>}
              {!!n.attachments?.length && <Attachments files={n.attachments} />}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit notice" : "Publish notice"}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !edit?.title || (perms.isClerk && !edit?.issued_by)} onClick={() => run(async () => { await saveNotice({ ...edit!, issued_by: edit!.issued_by || null, company_id: edit!.company_id || null, expiry_date: edit!.expiry_date || null, attachments: edit!.attachments ?? [] }); setEdit(null); reload(); }, "Published")}>Publish</button></>} wide>
        {edit && <div className="form-grid">
          <Field label="Title" wide required><input className="input" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Category"><Select value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} options={["Notice", "Order", "Circular", "Event", "Other"]} /></Field>
          <Field label="Priority"><Select value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: v as Notice["priority"] })} options={["Normal", "Important", "Urgent"]} /></Field>
          <Field label="Audience"><Select value={edit.company_id ?? ""} onChange={(v) => setEdit({ ...edit, company_id: v || null })} placeholder={perms.canEditUnitActivities ? "All ranks (whole unit)" : undefined} options={myCompanies.filter((c) => perms.canPublishNotice(c.id)).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="On behalf of" required={perms.isClerk} hint={perms.isClerk ? "Officer who ordered it" : "Optional — e.g. Adjt"}>
            <input className="input" list="notice-issuers" value={edit.issued_by ?? ""} onChange={(e) => setEdit({ ...edit, issued_by: e.target.value })} placeholder="Adjt" />
            <datalist id="notice-issuers">{issuers.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Publish on"><input className="input" type="date" value={edit.publish_date ?? today} onChange={(e) => setEdit({ ...edit, publish_date: e.target.value })} /></Field>
          <Field label="Expires on" hint="Optional"><input className="input" type="date" value={edit.expiry_date ?? ""} onChange={(e) => setEdit({ ...edit, expiry_date: e.target.value })} /></Field>
          <Field label="Text" wide><textarea className="input" rows={7} value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
          <Field label="Attachments (PDF or image)" wide hint={`Scanned order, letter or photo — up to ${Math.round(NOTICE_FILE_MAX / 1_000_000)} MB each`}>
            <FilePicker files={edit.attachments ?? []} onChange={(attachments) => setEdit({ ...edit, attachments })} />
          </Field>
        </div>}
      </Modal>
    </div>
  );
}

const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Upload PDF / image files for a notice; files are stored as soon as they are chosen. */
function FilePicker({ files, onChange }: { files: NoticeFile[]; onChange: (f: NoticeFile[]) => void }) {
  const { t } = useI18n();
  const { busy, run } = useAction();
  async function add(list: FileList | null) {
    if (!list?.length) return;
    await run(async () => {
      const out = [...files];
      for (const f of Array.from(list)) out.push(await uploadNoticeFile(f));
      onChange(out);
    }, `${list.length} ${t("file(s) attached")}`);
  }
  return (
    <div className="file-picker">
      {files.map((f, i) => (
        <span key={f.path} className="file-chip">
          {f.type === "application/pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
          <span className="file-name">{f.name}</span><small>{fileSize(f.size)}</small>
          <button type="button" aria-label="Remove" onClick={() => onChange(files.filter((_, j) => j !== i))}><X size={12} /></button>
        </span>
      ))}
      <label className={busy ? "btn btn-sm disabled" : "btn btn-sm"}>
        <Paperclip size={13} /> {busy ? t("Uploading…") : t("Attach PDF / image")}
        <input hidden type="file" multiple accept="application/pdf,image/*" disabled={busy} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
  );
}

/** Attachments shown under a notice: picture previews and PDF cards. */
function Attachments({ files }: { files: NoticeFile[] }) {
  const { t } = useI18n();
  const { run } = useAction();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    (async () => {
      const m: Record<string, string> = {};
      for (const f of files.filter((x) => x.type.startsWith("image/"))) { const u = await noticeFileUrl(f.path); if (u) m[f.path] = u; }
      if (live) setThumbs(m);
    })();
    return () => { live = false; };
  }, [files]);
  return (
    <div className="notice-files">
      {files.map((f) => f.type.startsWith("image/") ? (
        <button key={f.path} type="button" className="notice-img" onClick={() => run(() => openNoticeFile(f))} title={f.name}>
          {thumbs[f.path] ? <img src={thumbs[f.path]} alt={f.name} /> : <ImageIcon size={22} />}
        </button>
      ) : (
        <div key={f.path} className="notice-pdf">
          <FileText size={22} />
          <div><strong>{f.name}</strong><small>PDF · {fileSize(f.size)}</small></div>
          <button type="button" className="btn btn-xs" onClick={() => run(() => openNoticeFile(f))}>{t("Open")}</button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => run(() => openNoticeFile(f, true))} aria-label="Download"><Download size={12} /></button>
        </div>
      ))}
    </div>
  );
}
