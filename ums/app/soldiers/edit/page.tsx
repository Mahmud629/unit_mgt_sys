"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Alert, Card, ErrorBox, Field, Loading, PageHeader, Select, useAction, useAsync, useConfirm } from "@/components/ui";
import { FieldInput } from "@/components/record-modal";
import { deleteSoldier, getSoldier, saveSoldier } from "@/lib/api";
import { ALL_DISTRICTS, SOLDIER_FIELD_GROUPS, divisionOf, type FieldDef } from "@/lib/constants";
import { useSession } from "@/lib/session";
import type { Category, Soldier } from "@/lib/types";
import { ageYears, heightLabel, serviceYears, ymLabel } from "@/lib/utils";

type Form = Record<string, string>;

export default function SoldierEditPage() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const { perms, myCompanies, settings, reload: reloadSession } = useSession();
  const { busy, run } = useAction();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const editableCoys = myCompanies.filter((c) => perms.canEditCompany(c.id));

  const { data, error, loading } = useAsync(async () => (id ? getSoldier(id) : null), [id]);

  useEffect(() => {
    if (loading || form) return;
    if (data) setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])));
    else if (!id) setForm({ status: "Serving", category: "OR", medical_category: "A", company_id: editableCoys.length === 1 ? editableCoys[0].id : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading, id]);

  if (loading || !form) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (data && !perms.canEditCompany(data.company_id)) return <div className="page"><Alert tone="red">You cannot edit this soldier&apos;s record.</Alert></div>;

  const set = (k: string, v: string) => setForm((f) => ({ ...f!, [k]: v, ...(k === "home_district" ? { home_division: divisionOf(v) ?? "" } : {}), ...(k === "category" ? { rank: "" } : {}) }));
  const required = SOLDIER_FIELD_GROUPS.flatMap((g) => g.fields).filter((f) => f.required && !form[f.key]);

  function optionsFor(f: FieldDef) {
    if (f.type === "company") return editableCoys.map((c) => ({ value: c.id, label: c.name }));
    if (f.type === "rank") return settings.ranks[(form!.category || "OR") as Category] ?? [];
    if (f.type === "trade") return [...new Set([...settings.trades, ...(form!.trade ? [form!.trade] : [])])];
    if (f.type === "district") return ALL_DISTRICTS;
    return undefined;
  }

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const g of SOLDIER_FIELD_GROUPS) for (const f of g.fields) {
      const v = form![f.key] ?? "";
      payload[f.key] = v === "" ? null : f.type === "number" ? Number(v) : v;
    }
    payload.home_division = form!.home_division || divisionOf(form!.home_district) || null;
    payload.snk_no = String(payload.snk_no ?? "").trim();
    if (id) payload.id = id;
    const saved = await run(() => saveSoldier(payload as Partial<Soldier>), id ? "Record updated" : "Soldier added");
    if (saved) {
      void reloadSession(["directory"]);
      router.replace(`/soldiers/view?id=${saved.id}`);
    }
  }
  async function remove() {
    if (!id || !confirm("Permanently delete this soldier and ALL his records (leave, training, parade history)? Prefer changing Status to Retired / Transferred Out.")) return;
    const ok = await run(async () => { await deleteSoldier(id); return true; }, "Soldier deleted");
    if (ok) { void reloadSession(["directory"]); router.replace("/soldiers"); }
  }

  const preview = { date_of_birth: form.date_of_birth || null, date_of_enrolment: form.date_of_enrolment || null };
  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div style={{ marginBottom: 12 }}><Link href={id ? `/soldiers/view?id=${id}` : "/soldiers"} className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Back</Link></div>
      <PageHeader eyebrow="Personnel" title={id ? `Edit: ${data?.rank} ${data?.name}` : "Add soldier"}
        subtitle={<>Age {ymLabel(ageYears(preview))} · Service {ymLabel(serviceYears(preview))}{form.height_in ? ` · Height ${heightLabel(Number(form.height_in))}` : ""}</>}
        actions={<>
          {id && perms.canDeleteSoldier && <button className="btn btn-red" onClick={remove} disabled={busy}><Trash2 size={15} /> Delete</button>}
          <button className="btn btn-primary" onClick={save} disabled={busy || required.length > 0}><Save size={15} /> Save</button>
        </>} />
      {required.length > 0 && <Alert tone="amber">Required: {required.map((f) => f.label).join(", ")}</Alert>}
      <Card>
        {SOLDIER_FIELD_GROUPS.map((g) => (
          <div className="form-section" key={g.title}>
            <h3>{g.title}</h3>
            <div className="form-grid">
              {g.fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} hint={f.hint} wide={f.wide}>
                  {f.type === "company" || f.type === "rank" || f.type === "trade" || f.type === "district"
                    ? <Select value={form[f.key]} onChange={(v) => set(f.key, v)} placeholder="—" options={optionsFor(f)!} />
                    : f.key === "appointment" && form.category === "Offr"
                      ? <><input className="input" list="offr-appointments" value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder="Adjt, QM, Coy Comd, 2IC, CO…" /><datalist id="offr-appointments">{(settings.officer_appointments ?? []).map((a) => <option key={a} value={a} />)}</datalist></>
                      : <FieldInput def={f} value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} />}
                </Field>
              ))}
              {g.title === "Home & Contact" && <Field label="Home Division" hint="Set automatically from district"><input className="input" value={form.home_division ?? ""} disabled /></Field>}
            </div>
          </div>
        ))}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={save} disabled={busy || required.length > 0}><Save size={15} /> Save</button>
        </div>
      </Card>
    </div>
  );
}
