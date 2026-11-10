"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Empty, ErrorBox, Loading, PageHeader, Select, useAsync } from "@/components/ui";
import { listAudit, listProfilesBasic } from "@/lib/api";
import { fieldLabel } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { fmtDateTime, soldierLabel } from "@/lib/utils";

const TABLE_LABEL: Record<string, string> = { soldiers: "Soldier record", soldier_records: "Soldier sub-record", profiles: "User account", leave_applications: "Leave", profile_change_requests: "Profile request", training_records: "Training result", sick_reports: "Sick report" };

export default function AuditPage() {
  const { directoryById } = useSession();
  const [table, setTable] = useState("");
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, people] = await Promise.all([listAudit({ limit: 500 }), listProfilesBasic()]);
    return { rows, people: new Map(people.map((p) => [p.id, p.full_name])) };
  }, []);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !table || r.table_name === table), [data, table]);

  const describe = (r: (typeof rows)[number]) => {
    const c = r.changes as Record<string, unknown>;
    if (r.action === "UPDATE") return Object.entries(c).map(([k, v]) => `${fieldLabel(k)}: ${String((v as { from: unknown }).from ?? "—")} → ${String((v as { to: unknown }).to ?? "—")}`).join("; ");
    const sid = (c.soldier_id ?? (r.table_name === "soldiers" ? r.record_id : null)) as string | null;
    return `${r.action === "INSERT" ? "Created" : "Deleted"}${sid ? ` — ${soldierLabel(directoryById.get(sid))}` : ""}`;
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Audit Log"
        actions={<Select value={table} onChange={setTable} placeholder="All records" options={Object.entries(TABLE_LABEL).map(([value, label]) => ({ value, label }))} />} />
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No changes logged.</Empty> : (
          <div className="table-wrap tall"><table className="table compact">
            <thead><tr><th>When</th><th>By</th><th>Record</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.at)}</td>
                <td className="nowrap">{data?.people.get(r.actor ?? "") ?? "System"}</td>
                <td className="nowrap">{r.table_name === "soldiers" ? <Link className="link" href={`/soldiers/view?id=${r.record_id}`}>{TABLE_LABEL[r.table_name]}</Link> : TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                <td>{r.action}</td>
                <td className="small" style={{ maxWidth: 620 }}>{describe(r)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
