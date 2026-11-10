"use client";

// Personal-information form used by "Apply for new ID" and the first-login
// "Complete your profile" page. Driven by the same field list as the soldier file.
import { Plus, Trash2 } from "lucide-react";
import { Field, Select } from "./ui";
import { FieldInput } from "./record-modal";
import { ALL_DISTRICTS, RECORD_KINDS, REQUIRED_PROFILE_FIELDS, SOLDIER_FIELDS, divisionOf, type FieldDef, DEFAULT_SETTINGS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import type { Category } from "@/lib/types";
import { cls } from "@/lib/utils";

export type ProfileValues = Record<string, string>;
export type DraftRecord = { kind: "family" | "education"; data: Record<string, string> };

export interface ProfileOptions {
  companies: Array<{ id: string; name: string }>;
  ranks: Partial<Record<Category, string[]>>;
  trades: string[];
  /** officers' appointments (Settings) — offered as suggestions for an officer */
  appointments?: string[];
}

const fieldDef = (key: string): FieldDef => SOLDIER_FIELDS.find((f) => f.key === key) ?? { key, label: key, type: "text" };

/** Apply a change, keeping home division in step with the district and clearing rank when category changes. */
export function setProfileValue(v: ProfileValues, key: string, value: string): ProfileValues {
  const next = { ...v, [key]: value };
  if (key === "home_district") next.home_division = divisionOf(value) ?? "";
  if (key === "category") next.rank = "";
  return next;
}

/** Required keys for a form: the always-required personal info plus spouse details when married. */
export function requiredKeys(v: ProfileValues, base: string[] = []): string[] {
  return [...new Set([...base, ...REQUIRED_PROFILE_FIELDS, ...(v.marital_status === "Married" ? ["spouse_name", "date_of_marriage"] : [])])];
}

export function ProfileFields({ keys, values, onChange, options, required, showErrors, lockKeys = [] }: {
  keys: string[];
  values: ProfileValues;
  onChange: (key: string, value: string) => void;
  options: ProfileOptions;
  required: string[];
  showErrors?: boolean;
  lockKeys?: string[];
}) {
  const { t } = useI18n();
  return (
    <div className={cls("form-grid", showErrors && "fill-missing")}>
      {keys.map((key) => {
        if ((key === "spouse_name" || key === "date_of_marriage") && values.marital_status !== "Married" && !values[key]) return null;
        const f = fieldDef(key);
        const req = required.includes(key);
        const empty = !String(values[key] ?? "").trim();
        const locked = lockKeys.includes(key);
        let input;
        if (f.type === "company") input = <Select value={values[key] ?? ""} onChange={(v) => onChange(key, v)} placeholder="—" options={options.companies.map((c) => ({ value: c.id, label: c.name }))} disabled={locked} className={cls(showErrors && req && empty && "empty")} />;
        else if (f.type === "rank") input = <Select value={values[key] ?? ""} onChange={(v) => onChange(key, v)} placeholder="—" options={options.ranks[(values.category || "OR") as Category] ?? []} disabled={locked} className={cls(showErrors && req && empty && "empty")} />;
        else if (f.type === "trade") input = <Select value={values[key] ?? ""} onChange={(v) => onChange(key, v)} placeholder="—" options={[...new Set([...options.trades, ...(values.trade ? [values.trade] : [])])]} disabled={locked} />;
        else if (f.type === "district") input = <Select value={values[key] ?? ""} onChange={(v) => onChange(key, v)} placeholder="—" options={ALL_DISTRICTS} disabled={locked} className={cls(showErrors && req && empty && "empty")} />;
        else if (f.type === "select") input = <Select value={values[key] ?? ""} onChange={(v) => onChange(key, v)} placeholder="—" options={[...(f.options ?? [])]} disabled={locked} className={cls(showErrors && req && empty && "empty")} />;
        else if (key === "appointment" && values.category === "Offr") input = (
          <>
            <input className="input" list="offr-appointments" value={values[key] ?? ""} onChange={(e) => onChange(key, e.target.value)} placeholder="Adjt, QM, Coy Comd, 2IC, CO…" />
            <datalist id="offr-appointments">{(options.appointments ?? DEFAULT_SETTINGS.officer_appointments).map((a) => <option key={a} value={a} />)}</datalist>
          </>
        );
        else input = <FieldInput def={f} value={values[key] ?? ""} onChange={(v) => onChange(key, v)} />;
        return (
          <Field key={key} label={f.label} required={req} hint={f.hint} wide={f.wide || f.type === "textarea"}>
            {input}
            {showErrors && req && empty && <span className="field-hint" style={{ color: "var(--amber)" }}>{t("Required")}</span>}
          </Field>
        );
      })}
    </div>
  );
}

/** Small inline list editor for family members and civil education. */
export function RecordsEditor({ kind, records, onChange }: { kind: "family" | "education"; records: DraftRecord[]; onChange: (r: DraftRecord[]) => void }) {
  const { t } = useI18n();
  const def = RECORD_KINDS[kind];
  const mine = records.filter((r) => r.kind === kind);
  const others = records.filter((r) => r.kind !== kind);
  const fields = def.fields.filter((f) => kind !== "family" || ["name", "relation", "date_of_birth", "occupation", "mobile"].includes(f.key));
  const update = (i: number, key: string, value: string) => onChange([...others, ...mine.map((r, j) => (j === i ? { ...r, data: { ...r.data, [key]: value } } : r))]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between"><strong>{t(def.title)}</strong><button type="button" className="btn btn-sm" onClick={() => onChange([...records, { kind, data: {} }])}><Plus size={13} /> {t("Add")}</button></div>
      {mine.length === 0 && <span className="muted small">{t("None added yet.")}</span>}
      {mine.map((r, i) => (
        <div key={i} className="panel">
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.type === "select" ? <Select value={r.data[f.key] ?? ""} onChange={(v) => update(i, f.key, v)} placeholder="—" options={[...(f.options ?? [])]} /> : <FieldInput def={f} value={r.data[f.key] ?? ""} onChange={(v) => update(i, f.key, v)} />}
              </Field>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => onChange([...others, ...mine.filter((_, j) => j !== i)])}><Trash2 size={12} /> {t("Remove")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Records with their required fields filled (incomplete rows are dropped). */
export function cleanRecords(records: DraftRecord[]) {
  return records.filter((r) => RECORD_KINDS[r.kind].fields.filter((f) => f.required).every((f) => String(r.data[f.key] ?? "").trim()))
    .map((r) => ({ kind: r.kind, data: Object.fromEntries(Object.entries(r.data).filter(([, v]) => String(v).trim())), record_date: r.kind === "family" ? r.data.date_of_birth || null : null }));
}
