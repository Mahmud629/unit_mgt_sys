"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, ListChecks } from "lucide-react";
import { exportTablePdf } from "@/lib/pdf";
import { Columns, Donut, Legend, type Datum } from "@/components/charts";
import { useDrill } from "@/components/drill";
import { Card, CompanySelect, Empty, ErrorBox, Loading, PageHeader, Select, Tabs, useAsync } from "@/components/ui";
import { listSoldiers, listTrainingRecords } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import { hasOngoing, isCompletionType, resultColor, resultInk, resultLabel, seqName, seqStatesFor, seqStatus, trainingStatus } from "@/lib/compute";
import { exportXlsx } from "@/lib/excel";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Soldier, TrainingRecord } from "@/lib/types";
import { cls, currentYear, fmtDate, sortSoldiers } from "@/lib/utils";

const YEAR_STATES = ["Completed", "Partial", "Failed", "Not Started", "Exempted", "Perm Atts"];

export default function TrainingStatePage() {
  const { trainingTypes, myCompanies, companyById, perms, settings } = useSession();
  const { t, nameOf } = useI18n();
  const types = trainingTypes.filter((x) => x.active);
  const [year, setYear] = useState(currentYear());
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [period, setPeriod] = useState("1"); // "year" or sequence number
  const [coy, setCoy] = useState("");
  const [show, setShow] = useState("Not Started");
  const drill = useDrill();
  const type = types.find((x) => x.id === typeId);
  useEffect(() => setPeriod(type && type.frequency > 1 ? String(Math.min(type.frequency, new Date().getMonth() < 6 ? 1 : 2)) : "1"), [typeId, type]);

  const { data, error, loading, reload } = useAsync(async () => {
    const [soldiers, records] = await Promise.all([listSoldiers(), listTrainingRecords({ year })]);
    return { soldiers: soldiers.filter((s) => s.status === "Serving"), records };
  }, [year]);

  const calc = useMemo(() => {
    if (!data || !type) return null;
    const by = new Map<string, TrainingRecord[]>();
    for (const r of data.records) (by.get(r.soldier_id) ?? by.set(r.soldier_id, []).get(r.soldier_id)!).push(r);
    const seq = period === "year" ? null : Number(period);
    const rows = sortSoldiers(data.soldiers.filter((s) => !coy || s.company_id === coy)).map((s) => {
      const recs = (by.get(s.id) ?? []).filter((r) => r.training_type_id === type.id);
      let state: string;
      let reason: string | undefined;
      if (s.atts_type === "Perm Atts") state = "Perm Atts";
      else if (seq) { const x = seqStatus(type, s, recs, seq); state = x.state; reason = x.reason; }
      else {
        const x = trainingStatus(type, s, recs); state = x.state; reason = x.reason;
        // Speed March etc.: anything short of all done is "Yet to complete"
        if (isCompletionType(type) && !hasOngoing(type) && (state === "Partial" || state === "Failed")) state = "Not Started";
      }
      return { s, state, recs, reason };
    }).filter((r) => r.state !== "Not Applicable");
    const groups: Record<string, typeof rows> = {};
    for (const r of rows) (groups[r.state] ||= []).push(r);
    return { rows, groups, by, seq };
  }, [data, type, period, coy]);

  const states: string[] = period === "year" ? (hasOngoing(type) ? ["Completed", "Ongoing", "Not Started", "Perm Atts"] : isCompletionType(type) ? ["Completed", "Not Started", "Exempted", "Perm Atts"] : YEAR_STATES) : [...seqStatesFor(type), "Perm Atts"];
  const LABEL = (k: string) => (period === "year" && !isCompletionType(type) ? (k === "Not Started" ? "Yet to appear" : k) : resultLabel(type, k));
  const COLOR = (k: string): string => (period === "year" && !isCompletionType(type) ? (k === "Perm Atts" ? "#3d4b59" : COLORS[k]) : resultColor(type, k));
  const donut: Datum[] = states.map((k) => ({ key: k, label: t(LABEL(k)), value: calc?.groups[k]?.length ?? 0, color: COLOR(k) }));
  const eligible = (calc?.rows.length ?? 0) - (calc?.groups["Perm Atts"]?.length ?? 0);
  const done = period === "year" ? calc?.groups.Completed?.length ?? 0 : (calc?.groups.Pass?.length ?? 0) + (calc?.groups.Exempted?.length ?? 0);
  const periodName = type ? (period === "year" ? t("Whole year") : t(seqName(type, Number(period)))) : "";
  const list = calc?.rows.filter((r) => !show || r.state === show) ?? [];
  const recText = (recs: TrainingRecord[]) => (type ? recs.sort((a, b) => a.sequence_no - b.sequence_no || a.attempt_no - b.attempt_no).map((r) => `${t(seqName(type, r.sequence_no))}${r.attempt_no > 1 ? ` (${r.attempt_no})` : ""}: ${t(resultLabel(type, r.result))}${r.marks !== null ? ` ${r.marks}` : ""} · ${fmtDate(r.test_date, false)}`).join("  |  ") : "");

  async function exportAll() {
    if (!data || !calc) return;
    await exportXlsx(`Training_State_${year}`, [{
      name: "Training",
      rows: sortSoldiers(data.soldiers.filter((s) => !coy || s.company_id === coy)).map((s: Soldier, i) => ({
        Ser: i + 1, "Personal No": s.snk_no, Rank: s.rank, Name: s.name, Coy: companyById.get(s.company_id)?.short_name ?? "",
        ...Object.fromEntries(types.flatMap((tp) => Array.from({ length: tp.frequency }, (_, k) => {
          const st = s.atts_type === "Perm Atts" ? "Perm Atts" : seqStatus(tp, s, calc.by.get(s.id) ?? [], k + 1).state;
          return [`${tp.code} ${seqName(tp, k + 1)}`, resultLabel(tp, st)];
        }))),
      })),
    }]);
  }

  async function exportPdf() {
    if (!calc || !type) return;
    await exportTablePdf({
      filename: `Training_${type.code}_${period}_${year}`, unit: settings.unit.name,
      title: `${type.name} — ${type.frequency > 1 || period === "year" ? `${period === "year" ? "Whole year" : seqName(type, Number(period))} ` : ""}${year}`,
      subtitle: `${show ? LABEL(show) : "All"}${coy ? ` · ${companyById.get(coy)?.name}` : ""}`,
      chips: states.filter((k) => calc.groups[k]?.length).map((k) => ({ label: LABEL(k), value: String(calc.groups[k]!.length), color: COLOR(k) })),
      columns: [{ header: "Personal No", key: "no" }, { header: "Rank", key: "rank" }, { header: "Name", key: "name" }, { header: "Coy", key: "coy" }, { header: "Status", key: "status" }, { header: "Records this year", key: "recs" }],
      rows: list.map(({ s, state, recs, reason }) => ({ no: s.snk_no, rank: s.rank, name: s.name, coy: companyById.get(s.company_id)?.short_name ?? "", status: LABEL(state), recs: [reason, recText(recs)].filter(Boolean).join(" · "), __state: state })),
      colorize: (k, v) => (k === "status" ? COLOR(states.find((x) => LABEL(x) === v) ?? v) : null),
      rowAccent: (r) => COLOR(String(r.__state)),
    });
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Training" title="Training State"
        actions={<>
          <Select value={String(year)} onChange={(v) => setYear(Number(v))} options={[0, 1, 2, 3].map((d) => String(currentYear() - d))} />
          {myCompanies.length > 1 && <CompanySelect value={coy} onChange={setCoy} />}
          <button className="btn" onClick={exportAll} disabled={!calc}><Download size={15} /> Excel</button>
          <button className="btn" onClick={exportPdf} disabled={!calc || !list.length}><FileText size={15} /> PDF</button>
          {perms.canEditAnyCompany && <Link className="btn btn-primary" href="/training/entry"><ListChecks size={15} /> {t("Record results")}</Link>}
        </>} />
      <Tabs tabs={types.map((x) => ({ key: x.id, label: x.name }))} value={typeId} onChange={setTypeId} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : !calc || !type ? <Empty>No training tests configured.</Empty> : (
        <>
          <div className="row mb">
            {Array.from({ length: type.frequency }, (_, i) => String(i + 1)).map((n) => (
              <button key={n} className={cls("chip-btn big", period === n && "on")} onClick={() => setPeriod(n)}>{t(seqName(type, Number(n)))}</button>
            ))}
            {type.frequency > 1 && <button className={cls("chip-btn big", period === "year" && "on")} onClick={() => setPeriod("year")}>{t("Whole year")}</button>}
            <span className="muted small">{type.max_attempts > 1 ? `${t("Up to")} ${type.max_attempts} ${t("attempts")} · ` : ""}{t("Perm attached personnel are not counted.")}</span>
          </div>
          <div className="grid grid-main">
            <Card title={`${t(type.name)} — ${periodName}`}>
              <div className="donut-wrap">
                <Donut data={donut} size={190} center={`${eligible ? Math.round((done / eligible) * 100) : 0}%`} centerSub={`${done}/${eligible}`} onSelect={(k) => { setShow(k); drill.open(`${t(type.name)} · ${periodName} · ${t(LABEL(k))}`, (calc.groups[k] ?? []).map((r) => ({ soldierId: r.s.id, detail: [r.reason, recText(r.recs)].filter(Boolean).join(" · ") })), COLOR(k)); }} />
                <Legend data={donut} onSelect={(k) => setShow(k)} />
              </div>
            </Card>
            <Card title="Company-wise">
              <Columns height={170} groups={myCompanies.filter((c) => !coy || c.id === coy).map((c) => ({
                key: c.id, label: c.short_name,
                parts: states.filter((k) => k !== "Perm Atts").map((k) => ({ key: k, label: t(LABEL(k)), value: (calc.groups[k] ?? []).filter((r) => r.s.company_id === c.id).length, color: COLOR(k) })),
              }))} onSelect={(cid, k) => drill.open(`${companyById.get(cid)?.short_name} · ${periodName} · ${t(LABEL(k))}`, (calc.groups[k] ?? []).filter((r) => r.s.company_id === cid).map((r) => ({ soldierId: r.s.id, detail: [r.reason, recText(r.recs)].filter(Boolean).join(" · ") })), COLOR(k))} />
              <div className="legend">{states.filter((k) => k !== "Perm Atts").map((k) => <span key={k}><i style={{ background: COLOR(k) }} />{t(LABEL(k))}</span>)}</div>
            </Card>
          </div>
          <Card className="mt" pad={false} title={`${t(show ? LABEL(show) : "All")} — ${list.length}`}
            actions={<Select value={show} onChange={setShow} placeholder="All" options={states.map((k) => ({ value: k, label: LABEL(k) }))} />}>
            {list.length === 0 ? <Empty>Nobody in this group.</Empty> : (
              <div className="table-wrap tall"><table className="table compact">
                <thead><tr><th>#</th><th>{t("Soldier")}</th><th>{t("Coy")}</th><th>{t("Status")}</th><th>{t("Records this year")}</th></tr></thead>
                <tbody>{list.map(({ s, state, recs, reason }, i) => (
                  <tr key={s.id}>
                    <td className="muted">{i + 1}</td>
                    <td><div className="who"><Link className="link" href={`/soldiers/view?id=${s.id}`}>{s.rank} {nameOf(s)}</Link><span>{s.snk_no}</span></div></td>
                    <td>{companyById.get(s.company_id)?.short_name}</td>
                    <td><span className="badge" style={{ background: COLOR(state), color: resultInk(type, state) }}>{t(LABEL(state))}</span></td>
                    <td className="small muted">{[reason, recText(recs)].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {drill.modal}
    </div>
  );
}
