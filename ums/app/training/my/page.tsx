"use client";

// v3.4 — the individual's own training details (not only the calendar):
// this year's state per training, the cycle plan, every result on record,
// courses & cadres and what is planned next.
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, GraduationCap, Printer, Repeat, Target } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, useAsync } from "@/components/ui";
import { getSoldier, listCourses, listCyclePlans, listRecords, listTrainingEvents, listTrainingRecords } from "@/lib/api";
import { colorFor } from "@/lib/colors";
import { isCompletionType, resultColor, resultInk, resultLabel, seqName, seqStatus, trainingStatus, TRAINING_STATE_TONE } from "@/lib/compute";
import { CYCLE_COLORS, CYCLES, cycleOf } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { addDays, bdToday, cls, currentYear, fmtDate } from "@/lib/utils";

export default function MyTrainingPage() {
  const { profile, trainingTypes, settings } = useSession();
  const { t } = useI18n();
  const today = bdToday();
  const [year, setYear] = useState(currentYear());
  const sid = profile.soldier_id;
  const { data, error, loading, reload } = useAsync(async () => {
    if (!sid) return null;
    const [me, all, courses, records, plans, events] = await Promise.all([
      getSoldier(sid), listTrainingRecords({ soldierId: sid }), listCourses({ soldierId: sid }), listRecords(sid),
      listCyclePlans(year, sid).catch(() => []), listTrainingEvents(today, addDays(today, 30)),
    ]);
    return { me, all, courses, courseRecs: records.filter((r) => r.kind === "course"), plan: plans[0] ?? null, events };
  }, [sid, year]);

  const types = trainingTypes.filter((x) => x.active);
  const yearRecs = useMemo(() => (data?.all ?? []).filter((r) => r.year === year), [data, year]);
  const history = useMemo(() => [...(data?.all ?? [])].sort((a, b) => b.year - a.year || String(b.test_date).localeCompare(String(a.test_date)) || b.sequence_no - a.sequence_no || b.attempt_no - a.attempt_no), [data]);
  const typeById = new Map(trainingTypes.map((x) => [x.id, x]));
  const thisCycle = year === currentYear() ? cycleOf(today) : 0;

  if (!sid) return <div className="page"><Empty>{t("Your login is not yet linked to a soldier record. Please contact the Orderly Room.")}</Empty></div>;
  const me = data?.me;
  return (
    <div className="page my-training">
      <PageHeader eyebrow="Training" title="My Training" subtitle={me ? `${me.rank} ${me.name} · ${me.snk_no}` : undefined}
        actions={<>
          <select className="input" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((d) => <option key={d}>{currentYear() - d}</option>)}</select>
          <Link className="btn" href="/training/calendar"><CalendarDays size={15} /> {t("Training Calendar")}</Link>
          <button className="btn" onClick={() => window.print()}><Printer size={15} /> {t("Print")}</button>
        </>} />
      <div className="print-only report-title"><h2>{settings.unit.name} — {t("My Training")} {year}</h2>{me && <p>{me.rank} {me.name} · {me.snk_no}</p>}</div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : me && data && (
        <div className="stack">
          {/* --------------------------------------------- state per training */}
          <div className="trg-mine-grid">
            {types.map((type) => {
              const st = trainingStatus(type, me, yearRecs);
              if (st.state === "Not Applicable") return null;
              const label = isCompletionType(type) ? resultLabel(type, st.state) : st.state === "Not Started" ? "Yet to appear" : st.state;
              const tone = isCompletionType(type) && st.state === "Not Started" ? "red" : TRAINING_STATE_TONE[st.state];
              return (
                <div key={type.id} className={cls("trg-mine", `tone-${tone}`)}>
                  <div className="trg-mine-head">
                    <span className="trg-mine-ico"><Target size={16} /></span>
                    <strong>{t(type.name)}</strong>
                    <Badge tone={tone}>{t(label)}</Badge>
                  </div>
                  <div className="seq-chips">
                    {Array.from({ length: type.frequency }, (_, i) => i + 1).map((n) => {
                      const s = seqStatus(type, me, yearRecs, n);
                      if (s.state === "Not Applicable") return null;
                      return (
                        <span key={n} className="seq-chip" style={{ background: resultColor(type, s.state), color: resultInk(type, s.state) }}>
                          {t(seqName(type, n))}: {t(resultLabel(type, s.state))}{s.last?.marks != null ? ` (${s.last.marks})` : ""}{s.attempts > 1 ? ` · ${s.attempts} ${t("attempts")}` : ""}
                        </span>
                      );
                    })}
                  </div>
                  <small className="muted">{st.reason ? `${t("Exempted")}: ${st.reason}` : `${st.done}/${st.required} ${t("done")}${st.lastResult?.test_date ? ` · ${t("last")} ${fmtDate(st.lastResult.test_date)}` : ""}`}</small>
                </div>
              );
            })}
          </div>

          {/* --------------------------------------------------- cycle plan */}
          <Card title={<><Repeat size={15} /> {t("Cycle Plan")} {year}</>}>
            {!data.plan ? <Empty>{t("Not planned yet")}</Empty> : (
              <div className="cycle-mine">
                {CYCLES.map((c) => {
                  const act = data.plan?.[c.key as "c1"] ?? null;
                  return (
                    <div key={c.key} className={cls("mycyc-cell", thisCycle === c.n && "now")} style={{ ["--cc" as string]: CYCLE_COLORS[act ?? ""] ?? "#8a97a2" }}>
                      <small>{t(c.label)} · {t(c.months)}</small>
                      <strong>{act ? t(act) : "—"}</strong>
                      {thisCycle === c.n && <em>{t("Now")}</em>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="grid-2-equal">
            {/* ---------------------------------------------- courses */}
            <Card title={<><GraduationCap size={15} /> {t("Courses & Cadres")}</>} pad={false}>
              {data.courses.length + data.courseRecs.length === 0 ? <Empty>{t("No courses on record")}</Empty> : (
                <div className="table-wrap"><table className="table compact">
                  <thead><tr><th>{t("Course")}</th><th>{t("Dates")}</th><th>{t("Status")}</th><th>{t("Result")}</th></tr></thead>
                  <tbody>
                    {data.courses.map((c) => (
                      <tr key={c.id}><td><strong>{c.course_name}</strong><div className="small muted">{[c.institution, c.course_type].filter(Boolean).join(" · ")}</div></td>
                        <td className="nowrap small">{fmtDate(c.from_date)}{c.to_date ? ` – ${fmtDate(c.to_date)}` : ""}</td>
                        <td><Badge tone={c.status === "Completed" ? "green" : c.status === "Failed" ? "red" : c.status === "Withdrawn" ? "grey" : "blue"}>{t(c.status)}</Badge></td>
                        <td>{[c.result, c.grade].filter(Boolean).join(" · ") || "—"}</td></tr>
                    ))}
                    {data.courseRecs.map((r) => {
                      const d = r.data as Record<string, string>;
                      return <tr key={r.id}><td><strong>{d.course}</strong><div className="small muted">{d.institution}</div></td><td className="nowrap small">{fmtDate(d.from)}{d.to ? ` – ${fmtDate(d.to)}` : ""}</td><td><Badge tone="green">{t("On record")}</Badge></td><td>{d.result || "—"}</td></tr>;
                    })}
                  </tbody>
                </table></div>
              )}
            </Card>

            {/* ---------------------------------------------- next 30 days */}
            <Card title={<><CalendarDays size={15} /> {t("Next 30 days")}</>}>
              {data.events.filter((e) => e.end_date >= today && e.status !== "Cancelled").length === 0 ? <Empty>{t("Nothing planned")}</Empty> : (
                <div className="timeline">{data.events.filter((e) => e.end_date >= today && e.status !== "Cancelled").map((e) => (
                  <div className="tl-item" key={e.id}><span className="date-pill" style={{ background: colorFor(e.event_type) }}>{fmtDate(e.start_date, false)}</span><div><strong>{e.title}</strong><small>{t(e.event_type)}{e.venue ? ` · ${e.venue}` : ""}{e.end_date !== e.start_date ? ` · ${t("till")} ${fmtDate(e.end_date, false)}` : ""}</small></div></div>
                ))}</div>
              )}
            </Card>
          </div>

          {/* ------------------------------------------------ all results */}
          <Card title={t("All training results on record")} pad={false}>
            {history.length === 0 ? <Empty>{t("No training results yet")}</Empty> : (
              <div className="table-wrap"><table className="table compact">
                <thead><tr><th>{t("Year")}</th><th>{t("Training")}</th><th>{t("Test")}</th><th>{t("Date")}</th><th>{t("Result")}</th><th className="num">{t("Marks")}</th><th>{t("Part I Order")}</th><th>{t("Remarks")}</th></tr></thead>
                <tbody>{history.map((r) => {
                  const type = typeById.get(r.training_type_id);
                  return (
                    <tr key={r.id}>
                      <td>{r.year}</td>
                      <td><strong>{t(type?.name ?? "—")}</strong></td>
                      <td className="nowrap">{type ? t(seqName(type, r.sequence_no)) : r.sequence_no}{r.attempt_no > 1 ? <span className="muted small"> · {t("attempt")} {r.attempt_no}</span> : null}</td>
                      <td className="nowrap">{fmtDate(r.test_date)}</td>
                      <td><span className="seq-chip" style={{ background: resultColor(type ?? null, r.result), color: resultInk(type ?? null, r.result) }}>{t(resultLabel(type, r.result))}</span></td>
                      <td className="num">{r.marks ?? r.grade ?? "—"}</td>
                      <td className="small">{r.part1_no ?? "—"}</td>
                      <td className="small">{r.remarks ?? ""}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
