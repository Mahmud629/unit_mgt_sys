"use client";

import { useEffect, useState } from "react";
import { Field, Modal, Select } from "./ui";
import type { FieldDef } from "@/lib/constants";

/** Generic modal form driven by a list of field definitions. */
export function FormModal({ open, title, fields, initial, onClose, onSave, busy, saveLabel = "Save", note }: {
  open: boolean;
  title: string;
  fields: FieldDef[];
  initial: Record<string, string | null | undefined>;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void | Promise<void>;
  busy?: boolean;
  saveLabel?: string;
  note?: string;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setV(Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""])));
  }, [open, fields, initial]);
  const missing = fields.filter((f) => f.required && !String(v[f.key] ?? "").trim());
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || missing.length > 0} onClick={() => onSave(v)}>{saveLabel}</button></>}>
      {note && <p className="muted small" style={{ marginTop: 0 }}>{note}</p>}
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.hint} wide={f.wide || f.type === "textarea"}>
            <FieldInput def={f} value={v[f.key] ?? ""} onChange={(x) => setV((s) => ({ ...s, [f.key]: x }))} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}

export function FieldInput({ def, value, onChange, options }: { def: FieldDef; value: string; onChange: (v: string) => void; options?: ReadonlyArray<string | { value: string; label: string }> }) {
  if (def.type === "select" || options) return <Select value={value} onChange={onChange} placeholder="—" options={options ?? def.options ?? []} />;
  if (def.type === "textarea") return <textarea className="input" value={value} onChange={(e) => onChange(e.target.value)} rows={2} />;
  return <input className="input" type={def.type === "date" ? "date" : def.type === "number" ? "number" : "text"} step={def.type === "number" ? "any" : undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
}
