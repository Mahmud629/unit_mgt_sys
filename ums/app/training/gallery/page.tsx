"use client";

import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
import { Alert, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, useAction, useAsync, useConfirm } from "@/components/ui";
import { deleteTrainingPhoto, listTrainingPhotos, uploadTrainingPhoto } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { bdToday, fmtDate } from "@/lib/utils";

export default function GalleryPage() {
  const { perms, myCompanies, companyById, profile } = useSession();
  const { t } = useI18n();
  const { data, error, loading, reload } = useAsync(() => listTrainingPhotos(200), []);
  const [view, setView] = useState<number | null>(null);
  const [upload, setUpload] = useState(false);
  const { run } = useAction();
  const confirm = useConfirm();
  const canUpload = perms.isSuper || perms.isCoyComd;
  if (!perms.isOfficer) return <div className="page"><Alert tone="blue">{t("Training photos are for officers only.")}</Alert></div>;
  const photos = data ?? [];
  const cur = view !== null ? photos[view] : null;

  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Training Photos"
        actions={canUpload && <button className="btn btn-primary" onClick={() => setUpload(true)}><Upload size={15} /> {t("Upload photos")}</button>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : photos.length === 0 ? <Card><Empty icon={<Camera size={22} />}>No photos yet.</Empty></Card> : (
        <div className="gallery">
          {photos.map((p, i) => (
            <button key={p.id} className="gallery-item" onClick={() => setView(i)}>
              {p.url ? <img src={p.url} alt={p.caption ?? ""} loading="lazy" /> : <div className="gallery-missing"><Camera size={20} /></div>}
              <span className="gallery-cap"><strong>{p.caption || t("Training")}</strong><small>{fmtDate(p.taken_on)}{p.company_id ? ` · ${companyById.get(p.company_id)?.short_name}` : ""}</small></span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!cur} onClose={() => setView(null)} wide title={cur ? `${cur.caption ?? ""} · ${fmtDate(cur.taken_on)}` : ""}
        footer={cur && <>
          {(perms.isSuper || (perms.isCoyComd && cur.company_id && perms.canCommandCompany(cur.company_id))) && <button className="btn btn-red" style={{ marginRight: "auto" }} onClick={() => confirm(t("Delete this photo?")) && run(async () => { await deleteTrainingPhoto(cur); setView(null); reload(); }, t("Deleted"))}><Trash2 size={14} /></button>}
          <button className="btn" disabled={view === 0} onClick={() => setView((v) => (v! > 0 ? v! - 1 : v))}><ChevronLeft size={15} /></button>
          <button className="btn" disabled={view === photos.length - 1} onClick={() => setView((v) => (v! < photos.length - 1 ? v! + 1 : v))}><ChevronRight size={15} /></button>
        </>}>
        {cur?.url && <img src={cur.url} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} />}
      </Modal>

      {upload && <UploadModal onClose={() => setUpload(false)} onDone={() => { setUpload(false); reload(); }} companies={myCompanies.filter((c) => perms.canCommandCompany(c.id))} defaultCoy={perms.isSuper ? "" : profile.company_id ?? ""} unitAllowed={perms.isSuper} />}
    </div>
  );
}

function UploadModal({ onClose, onDone, companies, defaultCoy, unitAllowed }: { onClose: () => void; onDone: () => void; companies: Array<{ id: string; name: string }>; defaultCoy: string; unitAllowed: boolean }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [date, setDate] = useState(bdToday());
  const [coy, setCoy] = useState(defaultCoy);
  const [progress, setProgress] = useState<string | null>(null);
  const { busy, run } = useAction();
  async function go() {
    await run(async () => {
      let n = 0;
      for (const f of files) {
        setProgress(`${++n} / ${files.length}`);
        await uploadTrainingPhoto(f, { caption: caption || null, taken_on: date, company_id: coy || null, event_id: null });
      }
      onDone();
    }, t("Photos uploaded"));
    setProgress(null);
  }
  return (
    <Modal open onClose={onClose} title="Upload training photos"
      footer={<><button className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn btn-primary" disabled={busy || !files.length || (!coy && !unitAllowed)} onClick={go}><Upload size={14} /> {progress ?? `${t("Upload")} ${files.length || ""}`}</button></>}>
      <div className="form-grid">
        <Field label="Photos" wide hint="You can pick several. They are resized automatically to save data.">
          <input className="input" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} style={{ paddingTop: 6 }} />
        </Field>
        <Field label="Caption" wide><input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t("e.g. Morning PT, Map reading cadre")} /></Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Company"><Select value={coy} onChange={setCoy} placeholder={unitAllowed ? "Whole unit" : undefined} options={companies.map((c) => ({ value: c.id, label: c.name }))} /></Field>
      </div>
      {files.length > 0 && <div className="row mt">{files.slice(0, 8).map((f) => <img key={f.name} src={URL.createObjectURL(f)} alt="" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6 }} />)}</div>}
    </Modal>
  );
}

