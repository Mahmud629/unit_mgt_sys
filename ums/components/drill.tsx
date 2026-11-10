"use client";

// Drill-down list shown when a chart segment or tile is clicked.
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Download, FileText, Search } from "lucide-react";
import { exportTablePdf } from "@/lib/pdf";
import { Empty, Modal } from "./ui";
import { exportXlsx } from "@/lib/excel";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { addStrength, bdToday, sortSoldiers, strengthLabel, zeroStrength } from "@/lib/utils";

export interface DrillItem {
  soldierId: string;
  detail?: string;
}
interface DrillState {
  title: string;
  color?: string;
  items: DrillItem[];
  note?: ReactNode;
}

export function useDrill() {
  const [state, setState] = useState<DrillState | null>(null);
  const open = useCallback((title: string, items: DrillItem[], color?: string, note?: ReactNode) => setState({ title, items, color, note }), []);
  const modal = state ? <DrillModal state={state} onClose={() => setState(null)} /> : null;
  return { open, modal };
}

function DrillModal({ state, onClose }: { state: DrillState; onClose: () => void }) {
  const { directoryById, companyById, perms, settings } = useSession();
  const { t, nameOf } = useI18n();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const list = state.items.map((it) => ({ ...it, s: directoryById.get(it.soldierId) })).filter((x) => x.s);
    const term = q.trim().toLowerCase();
    const filtered = list.filter((x) => !term || `${x.s!.snk_no} ${x.s!.rank} ${x.s!.name} ${x.detail ?? ""}`.toLowerCase().includes(term));
    return sortSoldiers(filtered.map((x) => ({ ...x, category: x.s!.category, display_order: x.s!.display_order, snk_no: x.s!.snk_no })));
  }, [state, directoryById, q]);
  const strength = rows.reduce((st, r) => addStrength(st, r.s!.category), zeroStrength());

  return (
    <Modal open onClose={onClose} wide
      title={<span className="row"><i style={{ width: 12, height: 12, borderRadius: 3, background: state.color ?? "var(--navy-3)", display: "inline-block" }} />{state.title}<span className="badge badge-grey">{rows.length}</span><span className="mono small muted">{strengthLabel(strength)}</span></span>}
      footer={<><button className="btn" onClick={() => exportXlsx(`${state.title.replace(/[^\w]+/g, "_")}_${bdToday()}`, [{ name: "List", rows: rows.map((r, i) => ({ Ser: i + 1, "Personal No": r.s!.snk_no, Rank: r.s!.rank, Name: r.s!.name, Coy: companyById.get(r.s!.company_id)?.short_name ?? "", Detail: r.detail ?? "" })) }])} disabled={!rows.length}><Download size={14} /> Excel</button>
        <button className="btn" disabled={!rows.length} onClick={() => exportTablePdf({
          filename: `${state.title.replace(/[^\w]+/g, "_")}_${bdToday()}`, unit: settings.unit.name, title: state.title,
          chips: [{ label: "Count", value: String(rows.length), color: state.color ?? "#1c3d57" }, { label: "Offr+JCO+OR", value: strengthLabel(strength), color: "#4f6f52" }],
          columns: [{ header: "Personal No", key: "no" }, { header: "Rank", key: "rank" }, { header: "Name", key: "name" }, { header: "Coy", key: "coy" }, { header: "Details", key: "detail" }],
          rows: rows.map((r) => ({ no: r.s!.snk_no, rank: r.s!.rank, name: r.s!.name, coy: companyById.get(r.s!.company_id)?.short_name ?? "", detail: r.detail ?? "" })),
          rowAccent: () => state.color ?? null,
        })}><FileText size={14} /> PDF</button>
        <button className="btn btn-primary" onClick={onClose}>{t("Close")}</button></>}>
      {state.note}
      <div className="search" style={{ maxWidth: "none", marginBottom: 10 }}><Search size={15} /><input className="input" placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      {rows.length === 0 ? <Empty>{t("Nobody in this group.")}</Empty> : (
        <div className="table-wrap" style={{ maxHeight: "60vh" }}>
          <table className="table compact">
            <thead><tr><th>#</th><th>{t("Personal No")}</th><th>{t("Rank & Name")}</th><th>{t("Coy")}</th><th>{t("Details")}</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.soldierId + i}>
                <td className="muted">{i + 1}</td>
                <td className="mono nowrap">{r.s!.snk_no}</td>
                <td>{perms.isStaff ? <Link className="link" href={`/soldiers/view?id=${r.soldierId}`} onClick={onClose}>{r.s!.rank} {nameOf(r.s!)}</Link> : <>{r.s!.rank} {nameOf(r.s!)}</>}</td>
                <td>{companyById.get(r.s!.company_id)?.short_name}</td>
                <td className="small">{r.detail}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
