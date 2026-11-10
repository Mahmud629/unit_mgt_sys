"use client";

import { useState } from "react";
import { DatabaseBackup, Download, FileDown, Upload } from "lucide-react";
import { Alert, Badge, Card, PageHeader, useAction } from "@/components/ui";
import { fetchAll, upsertSoldiers } from "@/lib/api";
import { CATEGORIES, SOLDIER_FIELDS, divisionOf } from "@/lib/constants";
import { exportXlsx, parseDateCell, readSheet } from "@/lib/excel";
import { useSession } from "@/lib/session";
import type { Category, Soldier } from "@/lib/types";
import { bdToday } from "@/lib/utils";

const IMPORT_FIELDS = SOLDIER_FIELDS.filter((f) => !["home_division"].includes(f.key));

function parseHeight(v: string): number | null {
  if (!v) return null;
  const m = v.match(/^(\d)\s*['’ ]\s*(\d{1,2}(?:\.\d)?)?/);
  if (m && v.includes("'")) return Number(m[1]) * 12 + Number(m[2] ?? 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ImportExportPage() {
  const { companies, perms, settings, reload } = useSession();
  const [rows, setRows] = useState<Array<{ row: number; ok: boolean; error?: string; data?: Partial<Soldier> }> | null>(null);
  const { busy, run } = useAction();

  async function template() {
    await exportXlsx("Soldiers_Import_Template", [
      { name: "Soldiers", rows: [Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f.key === "snk_no" ? "4012999" : f.key === "company_id" ? companies[0]?.short_name ?? "" : f.key === "category" ? "OR" : f.key === "rank" ? "Snk" : f.key === "name" ? "Md Example Name" : f.key === "status" ? "Serving" : f.type === "date" ? "2015-01-31" : ""]))] },
      { name: "Help", rows: IMPORT_FIELDS.map((f) => ({ Column: f.key, Meaning: f.label, Required: f.required ? "Yes" : "", Values: f.key === "company_id" ? companies.map((c) => c.short_name).join(", ") : f.key === "rank" ? Object.values(settings.ranks).flat().join(", ") : f.options?.join(", ") ?? (f.type === "date" ? "YYYY-MM-DD or DD/MM/YYYY" : f.key === "height_in" ? "inches (66) or 5'6\"" : "") })) },
    ]);
  }

  /** A ready-to-fill CSV (opens in Excel) with three example soldiers. */
  function csvTemplate() {
    const coy = companies.filter((c) => perms.canEditCompany(c.id))[0] ?? companies[0];
    const ex: Array<Record<string, string>> = [
      { snk_no: "4012999", category: "OR", rank: "Snk", name: "Md Example Hossain", name_bn: "মোঃ উদাহরণ হোসেন", trade: settings.trades[0] ?? "", company_id: coy?.short_name ?? "", status: "Serving", date_of_birth: "1998-05-14", date_of_enrolment: "2017-01-15", height_in: "5'7\"", weight_lbs: "140", blood_group: "B+", medical_category: "A", religion: "Islam", marital_status: "Married", home_district: "Cumilla", mobile: "01700000000", accommodation: "Snk Lines" },
      { snk_no: "4011888", category: "OR", rank: "Cpl", name: "Abdul Example Karim", trade: settings.trades[1] ?? "", company_id: coy?.short_name ?? "", status: "Serving", date_of_birth: "15/08/1992", date_of_enrolment: "01/07/2011", height_in: "68", blood_group: "O+", medical_category: "A", home_district: "Bogura", mobile: "01800000000", accommodation: "Family Quarter", accommodation_details: "Qtr No 12/B" },
      { snk_no: "JCO-1234", category: "JCO", rank: "WO", name: "Example Rahman", company_id: coy?.short_name ?? "", status: "Serving", date_of_birth: "1984-02-01", home_district: "Rangpur", accommodation: "Out Living", accommodation_details: "House 4, Road 2, Cantt Bazar" },
    ];
    const cols = IMPORT_FIELDS.map((f) => f.key);
    const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = "\ufeff" + [cols.join(","), ...ex.map((r) => cols.map((k) => q(r[k] ?? "")).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "Soldiers_Upload_Demo.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function onFile(file?: File) {
    if (!file) return;
    await run(async () => {
      const raw = await readSheet(file);
      const parsed = raw.map((r, i) => {
        const get = (k: string, ...alts: string[]) => [k, ...alts].map((x) => r[x]).find((v) => v !== undefined && v !== "") ?? "";
        const coyRaw = get("company_id", "company", "coy").toLowerCase();
        const coy = companies.find((c) => [c.id, c.slug, c.name, c.short_name].some((x) => x.toLowerCase() === coyRaw));
        const category = (CATEGORIES.find((c) => c.toLowerCase() === get("category", "cat").toLowerCase()) ?? "") as Category;
        const snk = get("snk_no", "personal_no", "no", "army_no");
        const data: Record<string, unknown> = {};
        for (const f of IMPORT_FIELDS) {
          const v = f.key === "company_id" ? coy?.id ?? "" : f.key === "snk_no" ? snk : f.key === "category" ? category : get(f.key);
          if (v === "") continue;
          data[f.key] = f.type === "date" ? parseDateCell(String(v)) || null : f.key === "height_in" ? parseHeight(String(v)) : f.type === "number" ? Number(v) : v;
        }
        if (data.home_district) data.home_division = divisionOf(String(data.home_district));
        data.status ||= "Serving";
        const err = !snk ? "Personal No missing" : !get("name") ? "Name missing" : !get("rank") ? "Rank missing" : !category ? "Category must be Offr/JCO/OR" : !coy ? `Unknown company "${coyRaw}"` : !perms.canEditCompany(coy.id) ? "Not your company" : undefined;
        return { row: i + 2, ok: !err, error: err, data: data as Partial<Soldier> };
      });
      // Personal No must be unique (spaces and case ignored)
      const seen = new Map<string, number>();
      for (const p of parsed) {
        const key = String(p.data?.snk_no ?? "").replace(/\s+/g, "").toUpperCase();
        if (!key) continue;
        if (seen.has(key)) Object.assign(p, { ok: false, error: `Personal No repeated (also in row ${seen.get(key)})` });
        else seen.set(key, p.row);
      }
      setRows(parsed);
    });
  }

  async function backup() {
    await run(async () => {
      const tables = ["soldiers", "soldier_records", "leave_applications", "training_records", "course_nominations", "itp_items", "sick_reports", "duty_roster", "daily_programmes", "training_events", "notices", "parade_states", "parade_entries", "coy_submissions", "companies", "leave_types", "training_types", "cycle_plans", "officer_commitments"];
      const sheets = [];
      for (const t of tables) {
        const data = await fetchAll<Record<string, unknown>>(t);
        sheets.push({ name: t, rows: data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : (v as string | number | null)]))) });
      }
      await exportXlsx(`UMS_Backup_${bdToday()}`, sheets);
    }, "Backup downloaded");
  }

  const good = rows?.filter((r) => r.ok) ?? [];
  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Import / Export" />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card title="Upload individual data (CSV or Excel)" actions={<><button className="btn btn-sm btn-primary" onClick={csvTemplate}><FileDown size={13} /> Demo CSV format</button><button className="btn btn-sm" onClick={template}><Download size={13} /> Excel template</button></>}>
          <ol className="steps-list">
            <li>Download the demo CSV format — it has every column and three example soldiers.</li>
            <li>Open it in Excel, delete the examples and fill one row per soldier. Keep the first (header) row as it is.</li>
            <li>Save as CSV UTF-8 (keeps Bangla names) or as .xlsx, then choose the file below. Check the list, then press Import.</li>
          </ol>
          <Alert tone="blue">
            <div>Existing soldiers (same Personal No) are updated; new Personal Nos are added. Only the columns you fill are changed.</div>
            <div>Company: its short name (e.g. RDO) or full name. Dates: YYYY-MM-DD or DD/MM/YYYY. Height: inches (66) or 5&apos;6&quot;.</div>
            {!perms.isUnitWide && <div>You can upload soldiers of your own company only.</div>}
          </Alert>
          <label className="btn btn-primary"><Upload size={15} /> Choose CSV / Excel file<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {rows && <div className="mt">
            <div className="row-between"><span><strong>{good.length}</strong> ready · <strong style={{ color: "var(--red)" }}>{rows.length - good.length}</strong> with errors</span>
              <button className="btn btn-green" disabled={busy || !good.length} onClick={() => run(async () => { await upsertSoldiers(good.map((g) => g.data!)); await reload(["directory"]); setRows(null); }, `${good.length} soldier(s) imported`)}>Import {good.length} row(s)</button></div>
            <div className="table-wrap mt" style={{ maxHeight: 420 }}><table className="table compact">
              <thead><tr><th>Row</th><th>Personal No</th><th>Rank</th><th>Name</th><th>Check</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.row} className={r.ok ? undefined : "row-highlight"}><td>{r.row}</td><td className="mono">{r.data?.snk_no}</td><td>{r.data?.rank}</td><td>{r.data?.name}</td><td>{r.ok ? <Badge tone="green">OK</Badge> : <Badge tone="red">{r.error}</Badge>}</td></tr>)}</tbody>
            </table></div>
          </div>}
        </Card>
        {perms.isUnitWide && <Card title="Full backup">
          <p style={{ marginTop: 0 }}>Downloads every table you can see as one Excel workbook (one sheet per table). Keep it somewhere safe — it contains personal data.</p>
          <button className="btn" disabled={busy} onClick={backup}><DatabaseBackup size={15} /> Download backup</button>
        </Card>}
      </div>
    </div>
  );
}
