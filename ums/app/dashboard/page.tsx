"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, BookOpen, CalendarClock, Camera, CheckCircle2, ClipboardCheck, Dumbbell, GraduationCap, HeartPulse, Megaphone,
  Bus, ShieldCheck, Target, TrendingUp, UserCircle, UserPlus, Users,
} from "lucide-react";
import { Columns, Donut, HBars, Legend, StackBar, Tile, Trend, type Datum } from "@/components/charts";
import { useDrill, type DrillItem } from "@/components/drill";
import { ModuleBar } from "@/components/module-bar";
import { PhotoStrip } from "@/components/photo-strip";
import { Badge, Empty, ErrorBox, Loading, Modal, useAsync } from "@/components/ui";
import {
  ensureParadeStates, getParadeStatesForDate, getSoldier, listChangeRequests, listIdApplications, listCourses, listDuties, listLeave, listMyDuties, listNotices, listParadeEntries,
  listCyclePlans, listParadeStates, listProgrammes, listSoldiers, listSubmissions, listTrainingEvents, listTrainingPhotos, listTrainingRecords,
} from "@/lib/api";
import { colorFor, COLORS } from "@/lib/colors";
import { emptySeqGroups, isOnLeave, isOverstayed, leaveBalance, resultColor, resultInk, resultLabel, seqName, seqStatesFor, seqStatus, summarizeParade, trainingStatus, type SeqState } from "@/lib/compute";
import { CYCLE_COLORS, CYCLE_SHORT, CYCLES, ROLE_LABEL, cycleActivityOn, cycleOf, missingProfileFields } from "@/lib/constants";
import { MySoldierTasks, MyTasks } from "@/components/my-tasks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Notice, ParadeEntry, Soldier, TrainingRecord, TrainingType } from "@/lib/types";
import {
  addDays, ageYears, bdToday, cls, currentYear, fmtDate, fmtDateLong, fmtTime, retirementDate, serviceLeftYears, serviceYears, strengthLabel, strengthTotal, ymLabel,
} from "@/lib/utils";

export default function DashboardPage() {
  const { perms } = useSession();
  return perms.isSoldier ? <SoldierHome /> : <StaffHome />;
}

function greeting(t: (s: string) => string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hour12: false }).format(new Date()));
  return t(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
}
function shortName(full: string | null) {
  const p = String(full ?? "").split(/\s+/).filter(Boolean);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(" ");
}

function Section({ icon, title, sub, actions, children, id }: { icon: ReactNode; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  const { t } = useI18n();
  return (
    <section className="dash-section" id={id}>
      <div className="dash-head">
        <span className="dash-icon">{icon}</span>
        <div><h2>{t(title)}</h2>{sub && <p>{sub}</p>}</div>
        <span className="spacer" />
        {actions}
      </div>
      {children}
    </section>
  );
}

const PARADE_PARTS = ["On Parade", "Employed", "Leave", "Course", "Hospital", "Temp Atts", "Perm Atts", "AWOL", "Detention", "Other"];
const partOf = (e: ParadeEntry) => (e.state === "Absent" ? (PARADE_PARTS.includes(e.absent_reason ?? "") ? e.absent_reason! : "Other") : e.employment ? "Employed" : "On Parade");
const detailOf = (e: ParadeEntry) => (e.state === "Absent" ? [e.absent_reason, e.location, e.remarks ?? e.auto_note].filter(Boolean).join(" · ") : e.employment ? [e.employment, e.remarks].filter(Boolean).join(" · ") : "On parade");

// ===========================================================================
function StaffHome() {
  const { profile, perms, myCompanies, directoryById, trainingTypes, settings, companyById } = useSession();
  const { t } = useI18n();
  const today = bdToday();
  const year = currentYear();
  const drill = useDrill();
  const [compare, setCompare] = useState<string>("");

  const { data, error, loading, reload } = useAsync(async () => {
    try { await ensureParadeStates(today); } catch { /* view-only role */ }
    const [states, history] = await Promise.all([getParadeStatesForDate(today), listParadeStates(addDays(today, -13), today)]);
    // the state that is open now, else the last one of the day that has been opened
    const nowIso = new Date().toISOString();
    const opened = states.filter((s) => !s.opens_at || s.opens_at <= nowIso).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const latest = opened.find((s) => s.status === "Open" && (!s.closes_at || s.closes_at > nowIso)) ?? opened[opened.length - 1] ?? states[0] ?? null;
    const firsts = history.filter((s) => s.kind === "Morning" || s.state_type === "Morning State");
    const [entries, subs, histEntries, soldiers, records, courses, events, prog, duties, notices, photos, leave, reqs, apps] = await Promise.all([
      latest ? listParadeEntries(latest.id) : Promise.resolve([] as ParadeEntry[]),
      latest ? listSubmissions(latest.id) : Promise.resolve([]),
      listParadeEntries(firsts.map((s) => s.id)),
      listSoldiers(),
      listTrainingRecords({ year }),
      listCourses(),
      listTrainingEvents(today, addDays(today, 7)),
      listProgrammes(today, today),
      listDuties(today, today),
      listNotices(),
      perms.isOfficer ? listTrainingPhotos(12) : Promise.resolve([]),
      listLeave({ from: addDays(today, -45), to: addDays(today, 60) }),
      perms.canApproveAny ? listChangeRequests({ status: "Pending" }) : Promise.resolve([]),
      perms.isSuper ? listIdApplications("Pending").catch(() => []) : Promise.resolve([]),
    ]);
    return { latest, entries, subs, firsts, histEntries, soldiers, records, courses, events, prog, duties, notices, photos, leave, reqs, apps };
  }, [today]);

  const v = useMemo(() => {
    if (!data) return null;
    const scoped = data.entries.filter((e) => perms.canViewCompany(e.company_id));
    const { byCompany, total } = summarizeParade(scoped, directoryById);
    const byPart = new Map<string, ParadeEntry[]>();
    for (const e of scoped) (byPart.get(partOf(e)) ?? byPart.set(partOf(e), []).get(partOf(e))!).push(e);
    const donut: Datum[] = PARADE_PARTS.map((k) => ({ key: k, label: t(k), value: byPart.get(k)?.length ?? 0, color: COLORS[k] })).filter((d) => d.value > 0);

    // 14-day trend of present %
    const trend = data.firsts.slice().reverse().map((st) => {
      const es = data.histEntries.filter((e) => e.parade_state_id === st.id && perms.canViewCompany(e.company_id));
      const present = es.filter((e) => e.state === "Present").length;
      return { key: st.id, label: st.date.slice(8), value: es.length ? Math.round((present / es.length) * 100) : 0 };
    });

    // Training parade state (today)
    const covering = (from: string | null, to: string | null) => !!from && from <= today && (to ?? from) >= today;
    const visibleCourses = data.courses.filter((c) => perms.canViewCompany(c.company_id) && ["Nominated", "Attending"].includes(c.status) && covering(c.from_date, c.to_date));
    const ext = visibleCourses.filter((c) => c.course_type === "External");
    const cadre = visibleCourses.filter((c) => c.course_type === "Internal");
    const onTrg = scoped.filter((e) => e.state === "Present" && e.employment && /training|cadre/i.test(e.employment));
    const excused = scoped.filter((e) => e.state === "Present" && ["Excused Duty", "Light Duty"].includes(e.employment ?? ""));
    const eventsToday = data.events.filter((ev) => ev.start_date <= today && ev.end_date >= today && ev.status !== "Cancelled");

    // Yearly training state
    const serving = data.soldiers.filter((s) => s.status === "Serving" && s.atts_type !== "Perm Atts");
    const recBy = new Map<string, TrainingRecord[]>();
    for (const r of data.records) (recBy.get(r.soldier_id) ?? recBy.set(r.soldier_id, []).get(r.soldier_id)!).push(r);
    const seqStats = (type: TrainingType, seq: number, pool: Soldier[] = serving) => {
      const groups = emptySeqGroups<Soldier>();
      for (const s of pool) groups[seqStatus(type, s, recBy.get(s.id) ?? [], seq).state].push(s);
      return groups;
    };

    const overstayed = data.leave.filter((l) => perms.canViewCompany(l.company_id) && isOverstayed(l, today));
    const pendingLeave = data.leave.filter((l) => ["Applied", "Recommended"].includes(l.status) && perms.canDecideLeave(l.company_id, l.soldier_id));
    const retiring = serving.filter((s) => { const r = retirementDate(s, settings).date; return r && r >= today && r <= addDays(today, 180); });
    return { scoped, byCompany, total, byPart, donut, trend, ext, cadre, onTrg, excused, eventsToday, serving, recBy, seqStats, overstayed, pendingLeave, retiring };
  }, [data, perms, directoryById, today, t, settings]);

  const types = trainingTypes.filter((x) => x.active);
  const cmp = useMemo(() => {
    if (!compare || !v) return null;
    const type = types.find((x) => x.id === compare.split(":")[0]);
    if (!type) return null;
    const seq = Math.min(Number(compare.split(":")[1]) || 1, type.frequency);
    const rows = myCompanies.map((c) => {
      const g = v.seqStats(type, seq, v.serving.filter((s) => s.company_id === c.id));
      const total = seqStatesFor(type).reduce((n, k) => n + g[k].length, 0);
      return { c, g, total, pct: total ? Math.round(((g.Pass.length + g.Exempted.length) / total) * 100) : 0 };
    }).filter((r) => r.total > 0);
    return { type, seq, rows };
  }, [compare, v, types, myCompanies]);
  const toItems = (es: ParadeEntry[]): DrillItem[] => es.map((e) => ({ soldierId: e.soldier_id, detail: detailOf(e) }));
  const coyName = profile.company_id ? companyById.get(profile.company_id)?.name : null;

  return (
    <div className="page dash">
      <div className="hero">
        <div className="hero-text">
          <span className={`role-chip role-chip-${profile.role}`}>{t(ROLE_LABEL[profile.role])}{coyName ? ` · ${coyName}` : ""}</span>
          <h1>{greeting(t)}, {shortName(profile.full_name)}</h1>
          <p>{fmtDateLong(today)} · {settings.unit.name}</p>
        </div>
        <div className="hero-actions">
          {perms.canParadeAny && <Link href="/parade-state" className="btn btn-hero"><ClipboardCheck size={16} /> {t("Update parade state")}</Link>}
          {perms.canApproveAny && <Link href="/approvals" className="btn btn-hero-ghost"><BadgeCheck size={16} /> {t("Approvals")} {v && v.pendingLeave.length + (data?.reqs.length ?? 0) + (data?.apps.length ?? 0) > 0 && <em className="hero-count">{v.pendingLeave.length + (data?.reqs.length ?? 0) + (data?.apps.length ?? 0)}</em>}</Link>}
          {perms.isBnRep && <Link href="/daily/duty-roster" className="btn btn-hero-ghost"><ShieldCheck size={16} /> {t("Duty Roster")}</Link>}
          {perms.isClerk && <Link href="/soldiers" className="btn btn-hero"><Users size={16} /> {t("Soldiers Database")}</Link>}
          {perms.canEditAnyCompany && <Link href="/training/entry" className="btn btn-hero-ghost"><Target size={16} /> {t("Record Results")}</Link>}
        </div>
      </div>
      <ModuleBar />
      <MyTasks />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && v && (
        <>
          {(v.pendingLeave.length > 0 || data.reqs.length > 0 || v.overstayed.length > 0 || data.apps.length > 0) && (
            <div className="alert-strip">
              {v.pendingLeave.length > 0 && <Link href="/approvals" className="alert-chip amber"><Bus size={14} /> {v.pendingLeave.length} {t("leave waiting for approval")}</Link>}
              {data.apps.length > 0 && <Link href="/approvals" className="alert-chip amber"><UserPlus size={14} /> {data.apps.length} {t("new ID applications")}</Link>}
              {data.reqs.length > 0 && <Link href="/approvals" className="alert-chip blue"><UserCircle size={14} /> {data.reqs.length} {t("profile updates waiting")}</Link>}
              {v.overstayed.length > 0 && <button className="alert-chip red" onClick={() => drill.open(t("Overstayed leave"), v.overstayed.map((l) => ({ soldierId: l.soldier_id, detail: `Due ${fmtDate(l.to_date)}` })), COLORS.Absent)}><HeartPulse size={14} /> {v.overstayed.length} {t("overstayed leave")}</button>}
              {v.retiring.length > 0 && <button className="alert-chip grey" onClick={() => drill.open(t("Retiring within 6 months"), v.retiring.map((s) => ({ soldierId: s.id, detail: fmtDate(retirementDate(s, settings).date) })))}>{v.retiring.length} {t("retiring within 6 months")}</button>}
            </div>
          )}

          {/* ---------------------------------------------- daily parade state (not for the Clerk) */}
          {!perms.isClerk && <Section icon={<ClipboardCheck size={18} />} title="Daily Parade State"
            sub={<>{data.latest ? <>{t(data.latest.state_type)} · <Badge tone={data.latest.status === "Finalized" ? "green" : "amber"}>{t(data.latest.status)}</Badge></> : t("Not opened yet")} · <span className="muted">{t("Offr+JCO+OR")}</span></>}
            actions={<><Link className="btn btn-sm" href="/parade-state">{t("Open")}</Link><Link className="btn btn-sm btn-ghost" href="/parade-state/history">{t("Reports")} <ArrowRight size={13} /></Link></>}>
            <div className="tiles">
              <Tile label={t("Posted")} value={strengthLabel(v.total.posted)} sub={`${strengthTotal(v.total.posted)} ${t("all ranks")}`} color={COLORS.Posted} icon={<Users size={15} />} onClick={() => drill.open(t("Posted"), toItems(v.scoped), COLORS.Posted)} />
              <Tile label={t("Present")} value={strengthLabel(v.total.present)} sub={strengthTotal(v.total.present)} color={COLORS.Present} icon={<CheckCircle2 size={15} />} onClick={() => drill.open(t("Present"), toItems(v.scoped.filter((e) => e.state === "Present")), COLORS.Present)} />
              <Tile label={t("On Parade")} value={strengthLabel(v.total.onParade)} sub={strengthTotal(v.total.onParade)} color={COLORS["On Parade"]} icon={<Users size={15} />} onClick={() => drill.open(t("On Parade"), toItems(v.byPart.get("On Parade") ?? []), COLORS["On Parade"])} />
              <Tile label={t("Employed")} value={strengthLabel(v.total.employed)} sub={strengthTotal(v.total.employed)} color={COLORS.Employed} icon={<ShieldCheck size={15} />} onClick={() => drill.open(t("Employed"), toItems(v.byPart.get("Employed") ?? []), COLORS.Employed)} />
              <Tile label={t("Absent")} value={strengthLabel(v.total.absent)} sub={strengthTotal(v.total.absent)} color={COLORS.Absent} icon={<Bus size={15} />} onClick={() => drill.open(t("Absent"), toItems(v.scoped.filter((e) => e.state === "Absent")), COLORS.Absent)} />
            </div>
            <div className="dash-grid">
              <div className="panel">
                <h3>{t("Where everyone is")}</h3>
                <div className="donut-wrap">
                  <Donut data={v.donut} center={strengthTotal(v.total.posted)} centerSub={t("Posted")} onSelect={(k) => drill.open(t(k), toItems(v.byPart.get(k) ?? []), COLORS[k])} />
                  <Legend data={v.donut.map((d) => ({ ...d, sub: strengthLabel(v.byPart.get(d.key)!.reduce((st, e) => { const c = directoryById.get(e.soldier_id)?.category ?? "OR"; st[c as "OR"]++; return st; }, { Offr: 0, JCO: 0, OR: 0 })) }))} onSelect={(k) => drill.open(t(k), toItems(v.byPart.get(k) ?? []), COLORS[k])} />
                </div>
              </div>
              <div className="panel">
                {myCompanies.length > 1 ? (
                  <>
                    <h3>{t("Company-wise")}</h3>
                    <Columns height={150} groups={myCompanies.filter((c) => v.byCompany.has(c.id)).map((c) => {
                      const es = v.scoped.filter((e) => e.company_id === c.id);
                      return { key: c.id, label: c.short_name, parts: ["On Parade", "Employed", "Absent"].map((p) => ({ key: p, label: t(p), value: es.filter((e) => (p === "Absent" ? e.state === "Absent" : partOf(e) === p)).length, color: COLORS[p] })) };
                    })} onSelect={(cid, p) => drill.open(`${companyById.get(cid)?.short_name} · ${t(p)}`, toItems(v.scoped.filter((e) => e.company_id === cid && (p === "Absent" ? e.state === "Absent" : partOf(e) === p))), COLORS[p])} />
                    <div className="sub-chips">
                      {myCompanies.map((c) => { const sub = data.subs.find((x) => x.company_id === c.id); return <span key={c.id} className={`sub-chip st-${(sub?.status ?? "Draft").toLowerCase()}`} title={t(sub?.status ?? "Draft")}>{c.short_name}</span>; })}
                    </div>
                  </>
                ) : (
                  <>
                    <h3>{t("Employed — by duty")}</h3>
                    {Object.keys(v.total.employedBy).length === 0 ? <Empty>{t("Nobody employed")}</Empty> : (
                      <HBars data={Object.entries(v.total.employedBy).map(([k, s], i) => ({ key: k, label: k, value: strengthTotal(s), color: colorFor(k, i) })).sort((a, b) => b.value - a.value)}
                        onSelect={(k) => drill.open(k, toItems(v.scoped.filter((e) => e.state === "Present" && e.employment === k)), colorFor(k))} />
                    )}
                  </>
                )}
              </div>
              <div className="panel">
                <h3><TrendingUp size={14} /> {t("Present % — last 14 days")}</h3>
                {v.trend.length < 2 ? <Empty>{t("Not enough history yet")}</Empty> : <Trend points={v.trend} suffix="%" />}
              </div>
            </div>
          </Section>}

          {/* ------------------------------------------ training parade state */}
          <Section icon={<Dumbbell size={18} />} title="Training Parade State"
            actions={<Link className="btn btn-sm btn-ghost" href="/training/calendar">{t("Calendar")} <ArrowRight size={13} /></Link>}>
            <div className="tiles">
              <Tile label={t("Available for training")} value={strengthTotal(v.total.onParade)} sub={t("on parade today")} color="#3f8f55" icon={<Users size={15} />} onClick={() => drill.open(t("Available for training"), toItems(v.byPart.get("On Parade") ?? []), "#3f8f55")} />
              <Tile label={t("On external course")} value={v.ext.length} sub={t("away from unit")} color={COLORS.Course} icon={<GraduationCap size={15} />} onClick={() => drill.open(t("On external course"), v.ext.map((c) => ({ soldierId: c.soldier_id, detail: `${c.course_name} · ${c.institution ?? ""}` })), COLORS.Course)} />
              <Tile label={t("In unit cadre")} value={v.cadre.length} sub={t("internal course")} color="#2c9fb9" icon={<BookOpen size={15} />} onClick={() => drill.open(t("In unit cadre"), v.cadre.map((c) => ({ soldierId: c.soldier_id, detail: c.course_name })), "#2c9fb9")} />
              <Tile label={t("Employed on training")} value={v.onTrg.length} sub={t("instructors / staff")} color="#7a5bc7" icon={<Activity size={15} />} onClick={() => drill.open(t("Employed on training"), toItems(v.onTrg), "#7a5bc7")} />
              <Tile label={t("Excused / light duty")} value={v.excused.length} sub={t("cannot train today")} color="#e0a133" icon={<HeartPulse size={15} />} onClick={() => drill.open(t("Excused / light duty"), toItems(v.excused), "#e0a133")} />
            </div>
            <div className="event-list">
              {v.eventsToday.length === 0 ? <span className="muted small">{t("No training event on the calendar today.")}</span> : v.eventsToday.map((ev) => (
                <div key={ev.id} className="event-pill" style={{ borderColor: colorFor(ev.event_type) }}>
                  <strong>{ev.title}</strong><span>{t(ev.event_type)}{ev.venue ? ` · ${ev.venue}` : ""}{ev.company_id ? ` · ${companyById.get(ev.company_id)?.short_name}` : ""}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ----------------------------------------------- daily commitments */}
          <Section icon={<CalendarClock size={18} />} title="Daily Commitments"
            actions={<><Link className="btn btn-sm btn-ghost" href="/daily/programme">{t("Programme")}</Link><Link className="btn btn-sm btn-ghost" href="/daily/duty-roster">{t("Duty Roster")}</Link></>}>
            <div className="dash-grid three">
              <div className="panel">
                <h3>{t("Today's programme")}</h3>
                {data.prog.length === 0 ? <Empty>{t("No programme published")}</Empty> : (
                  <div className="timeline">
                    {data.prog.sort((a, b) => String(a.time_from).localeCompare(String(b.time_from))).map((p) => (
                      <div className={cls("tl-item", p.status === "Cancelled" && "muted")} key={p.id}><span className="time-pill">{fmtTime(p.time_from)}</span><div><strong>{p.activity}</strong><small>{[p.venue, p.participants].filter(Boolean).join(" · ")}</small></div></div>
                    ))}
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>{t("Today's duties")}</h3>
                {data.duties.length === 0 ? <Empty>{t("No duties detailed")}</Empty> : (
                  <div className="duty-list">
                    {data.duties.map((d) => { const s = directoryById.get(d.soldier_id); return (
                      <button key={d.id} className="duty-row" onClick={() => drill.open(d.duty_type, [{ soldierId: d.soldier_id, detail: d.shift ?? "" }], colorFor(d.duty_type))}>
                        <i style={{ background: colorFor(d.duty_type) }} /><span>{d.duty_type}{d.shift ? <small> {d.shift}</small> : null}</span><strong>{s ? `${s.rank} ${s.name.split(" ").slice(-1)[0]}` : "—"}</strong>
                      </button>
                    ); })}
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>{t("Next 7 days")}</h3>
                {data.events.filter((e) => e.start_date > today).length === 0 ? <Empty>{t("Nothing planned")}</Empty> : (
                  <div className="timeline">
                    {data.events.filter((e) => e.start_date > today).slice(0, 6).map((e) => (
                      <div className="tl-item" key={e.id}><span className="date-pill" style={{ background: colorFor(e.event_type) }}>{fmtDate(e.start_date, false)}</span><div><strong>{e.title}</strong><small>{t(e.event_type)}{e.venue ? ` · ${e.venue}` : ""}</small></div></div>
                    ))}
                  </div>
                )}
                <NoticeMini notices={data.notices} />
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------- yearly training state */}
          <Section icon={<Target size={18} />} title="Yearly Training State" sub={String(year)}
            actions={<Link className="btn btn-sm btn-ghost" href="/training">{t("Details")} <ArrowRight size={13} /></Link>}>
            <div className="trg-cards">
              {types.flatMap((type) => {
                if (type.code === "SM") {
                  // Speed March: Completed (all 4) / Yet to complete / Exempted
                  const overall = { Completed: [] as Soldier[], "Not Started": [] as Soldier[], Exempted: [] as Soldier[] };
                  for (const s of v.serving) {
                    const st = trainingStatus(type, s, v.recBy.get(s.id) ?? []).state;
                    if (st === "Completed") overall.Completed.push(s); else if (st === "Exempted") overall.Exempted.push(s); else if (st !== "Not Applicable") overall["Not Started"].push(s);
                  }
                  const dd: Datum[] = (Object.keys(overall) as Array<keyof typeof overall>).map((k) => ({ key: k, label: t(k === "Not Started" ? "Yet to complete" : k === "Completed" ? "Completed (all 4)" : k), value: overall[k].length, color: resultColor(type, k) }));
                  const tot = dd.reduce((n, d) => n + d.value, 0);
                  return [(
                    <div className="trg-card wide" key={type.id}>
                      <div className="trg-title"><strong>{t(type.name)}</strong><span>{tot ? Math.round((overall.Completed.length / tot) * 100) : 0}% {t("completed all")}</span></div>
                      <div className="trg-body">
                        <Donut size={120} thickness={18} data={dd} center={overall.Completed.length} centerSub={t("all 4")} onSelect={(k) => drill.open(`${t(type.name)} · ${dd.find((d) => d.key === k)?.label}`, overall[k as keyof typeof overall].map((s) => ({ soldierId: s.id })), COLORS[k])} />
                        <div className="sm-bars">
                          {Array.from({ length: type.frequency }, (_, i) => i + 1).map((n) => {
                            const g = v.seqStats(type, n);
                            return (
                              <div key={n} className="sm-row">
                                <span>{t(seqName(type, n))}</span>
                                <StackBar data={seqStatesFor(type).map((k) => ({ key: k, label: t(resultLabel(type, k)), value: g[k].length, color: resultColor(type, k) }))} onSelect={(k) => drill.open(`${t(seqName(type, n))} · ${t(resultLabel(type, k))}`, g[k as SeqState].map((s) => ({ soldierId: s.id })), resultColor(type, k))} />
                                <small>{g.Pass.length}</small>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {myCompanies.length > 1 && <div className="trg-foot"><button className="compare-btn" onClick={() => setCompare(`${type.id}:${type.frequency}`)}><BarChart3 size={13} /> {t("Compare companies")}</button></div>}
                    </div>
                  )];
                }
                return Array.from({ length: type.frequency }, (_, i) => i + 1).map((n) => {
                  const g = v.seqStats(type, n);
                  const states = seqStatesFor(type);
                  const dd: Datum[] = states.map((k) => ({ key: k, label: t(resultLabel(type, k)), value: g[k].length, color: resultColor(type, k) }));
                  const tot = dd.reduce((x, d) => x + d.value, 0);
                  const pct = tot ? Math.round(((g.Pass.length + g.Exempted.length) / tot) * 100) : 0;
                  const title = type.frequency > 1 ? `${t(type.name)} — ${t(seqName(type, n))}` : t(type.name);
                  return (
                    <div className="trg-card" key={`${type.id}-${n}`}>
                      <div className="trg-title"><strong>{title}</strong><span className={pct >= 90 ? "text-green" : pct >= 60 ? "text-amber" : "text-red"}>{pct}%</span></div>
                      <div className="trg-body">
                        <Donut size={116} thickness={17} data={dd} center={g.Pass.length} centerSub={t(resultLabel(type, "Pass"))} onSelect={(k) => drill.open(`${title} · ${t(resultLabel(type, k))}`, g[k as SeqState].map((s) => { const st = seqStatus(type, s, v.recBy.get(s.id) ?? [], n); return { soldierId: s.id, detail: st.reason ?? st.last?.marks?.toString() ?? "" }; }), resultColor(type, k))} />
                        <Legend compact data={dd} onSelect={(k) => drill.open(`${title} · ${t(resultLabel(type, k))}`, g[k as SeqState].map((s) => { const st = seqStatus(type, s, v.recBy.get(s.id) ?? [], n); return { soldierId: s.id, detail: st.reason ?? st.last?.marks?.toString() ?? "" }; }), resultColor(type, k))} />
                      </div>
                      {myCompanies.length > 1 && <div className="trg-foot"><button className="compare-btn" onClick={() => setCompare(`${type.id}:${n}`)}><BarChart3 size={13} /> {t("Compare companies")}</button></div>}
                    </div>
                  );
                });
              })}
            </div>
            {cmp && (
              <Modal open wide onClose={() => setCompare("")} title={`${t("Company comparison")} — ${t(cmp.type.name)}${cmp.type.frequency > 1 ? ` · ${t(seqName(cmp.type, cmp.seq))}` : ""}`}
                footer={<button className="btn btn-primary" onClick={() => setCompare("")}>{t("Close")}</button>}>
                <div className="row mb">{types.flatMap((tp) => Array.from({ length: tp.frequency }, (_, i) => i + 1).map((n) => (
                  <button key={`${tp.id}:${n}`} className={cls("chip-btn", cmp.type.id === tp.id && cmp.seq === n && "on")} onClick={() => setCompare(`${tp.id}:${n}`)}>{tp.code}{tp.frequency > 1 ? ` ${n}` : ""}</button>
                )))}</div>
                <Columns height={170} groups={cmp.rows.map((r) => ({ key: r.c.id, label: r.c.short_name, parts: seqStatesFor(cmp.type).map((k) => ({ key: k, label: t(resultLabel(cmp.type, k)), value: r.g[k].length, color: resultColor(cmp.type, k) })) }))}
                  onSelect={(cid, k) => { const r = cmp.rows.find((x) => x.c.id === cid)!; setCompare(""); drill.open(`${r.c.short_name} · ${t(cmp.type.name)} · ${t(resultLabel(cmp.type, k))}`, r.g[k as SeqState].map((s) => ({ soldierId: s.id })), resultColor(cmp.type, k)); }} />
                <div className="legend">{seqStatesFor(cmp.type).map((k) => <span key={k}><i style={{ background: resultColor(cmp.type, k) }} />{t(resultLabel(cmp.type, k))}</span>)}</div>
                <div className="table-wrap mt"><table className="table compact">
                  <thead><tr><th>{t("Coy")}</th><th className="num">{t("Strength")}</th>{seqStatesFor(cmp.type).map((k) => <th key={k} className="num">{t(resultLabel(cmp.type, k))}</th>)}<th className="num">%</th></tr></thead>
                  <tbody>{cmp.rows.sort((a, b) => b.pct - a.pct).map((r, i) => (
                    <tr key={r.c.id}><td><strong>{i === 0 && r.total ? "🏆 " : ""}{r.c.name}</strong></td><td className="num">{r.total}</td>
                      {seqStatesFor(cmp.type).map((k) => <td key={k} className="num"><button className="link" style={{ border: 0, background: "none", padding: 0 }} disabled={!r.g[k].length} onClick={() => { setCompare(""); drill.open(`${r.c.short_name} · ${t(resultLabel(cmp.type, k))}`, r.g[k as SeqState].map((s) => ({ soldierId: s.id })), resultColor(cmp.type, k)); }}>{r.g[k].length}</button></td>)}
                      <td className="num"><strong className={r.pct >= 90 ? "text-green" : r.pct >= 60 ? "text-amber" : "text-red"}>{r.pct}%</strong></td></tr>
                  ))}</tbody>
                </table></div>
              </Modal>
            )}
          </Section>

          {/* ------------------------------------------------- photos */}
          {perms.isOfficer && <Section icon={<Camera size={18} />} title="Daily Training Activities" actions={<Link className="btn btn-sm btn-ghost" href="/training/gallery">{t("All photos")} <ArrowRight size={13} /></Link>}>
            <PhotoStrip photos={data.photos} />
          </Section>}
        </>
      )}
      {drill.modal}
    </div>
  );
}

function NoticeMini({ notices }: { notices: Notice[] }) {
  const { t } = useI18n();
  const today = bdToday();
  const live = notices.filter((n) => n.publish_date <= today && (!n.expiry_date || n.expiry_date >= today)).slice(0, 3);
  if (!live.length) return null;
  return (
    <div className="notice-mini">
      <h3><Megaphone size={13} /> {t("Notices")}</h3>
      {live.map((n) => <Link href="/notices" key={n.id} className={`nm-item pr-${n.priority.toLowerCase()}`}><strong>{n.title}</strong><small>{fmtDate(n.publish_date)}</small></Link>)}
    </div>
  );
}

// ===========================================================================
function SoldierHome() {
  const { profile, perms, leaveTypes, trainingTypes, companyById, settings } = useSession();
  const { t, nameOf } = useI18n();
  const today = bdToday();
  const year = currentYear();
  const sid = profile.soldier_id;
  const { data, error, loading, reload } = useAsync(async () => {
    if (!sid) return null;
    const [me, leave, training, duties, prog, events, notices, photos, reqs, plans] = await Promise.all([
      getSoldier(sid), listLeave({ soldierId: sid }), listTrainingRecords({ soldierId: sid, year }), listMyDuties(sid, today), listProgrammes(today, addDays(today, 1)),
      listTrainingEvents(today, addDays(today, 7)), listNotices(), perms.isOfficer ? listTrainingPhotos(12) : Promise.resolve([]), listChangeRequests({ soldierId: sid }), listCyclePlans(year, sid).catch(() => []),
    ]);
    return { me, leave, training, duties, prog, events, notices, photos, reqs, plan: plans[0] ?? null };
  }, [sid]);

  if (!sid) return <div className="page"><Empty>{t("Your login is not yet linked to a soldier record. Please contact the Orderly Room.")}</Empty></div>;
  const me = data?.me;
  const bal = data ? leaveBalance(data.leave, leaveTypes, year) : [];
  const al = bal.find((b) => b.quota !== null);
  const dutyToday = data?.duties.find((d) => d.date === today);
  const onLeave = data?.leave.find((l) => isOnLeave(l, today));

  return (
    <div className="page dash">
      <div className="hero soldier">
        <div className="hero-text">
          <span className="role-chip role-chip-soldier">{me ? `${me.snk_no} · ${companyById.get(me.company_id)?.name ?? ""}` : t("Individual Soldier")}</span>
          <h1>{greeting(t)}, {me ? `${me.rank} ${nameOf(me).split(" ").slice(-1)[0]}` : ""}</h1>
          <p>{fmtDateLong(today)}</p>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-hero" href="/leave?apply=1"><Bus size={16} /> {t("Apply for leave")}</Link>
          <Link className="btn btn-hero-ghost" href="/my-profile"><UserCircle size={16} /> {t("Update my info")}</Link>
        </div>
      </div>
      <ModuleBar />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {me && data && (
        <>
          <MySoldierTasks duties={data.duties} leave={data.leave} reqs={data.reqs} cycle={cycleActivityOn(data.plan, today)} profileMissing={missingProfileFields(me as unknown as Record<string, unknown>).length} />
          <div className="tiles">
            <Tile label={t("Today")} value={onLeave ? t("On leave") : dutyToday ? dutyToday.duty_type : t("On parade")} sub={dutyToday?.shift ?? (onLeave ? `${t("till")} ${fmtDate(onLeave.to_date)}` : t("No duty today"))} color={onLeave ? COLORS.Leave : dutyToday ? COLORS.Employed : COLORS.Present} icon={<ShieldCheck size={15} />} />
            <Tile label={t("Service")} value={ymLabel(serviceYears(me))} sub={`${t("Age")} ${ymLabel(ageYears(me))}`} color="#1c3d57" icon={<UserCircle size={15} />} />
            <Tile label={t("Service left")} value={ymLabel(serviceLeftYears(me, settings))} sub={retirementDate(me, settings).date ? fmtDate(retirementDate(me, settings).date) : t("Not recorded")} color="#b36a1d" icon={<CalendarClock size={15} />} />
            <Tile label={`${t("This cycle")} (C${cycleOf(today)})`} value={cycleActivityOn(data.plan, today) ? t(cycleActivityOn(data.plan, today)!) : "—"} sub={data.plan ? CYCLES.map((c) => CYCLE_SHORT[data.plan?.[c.key as "c1"] ?? ""] ?? "—").join(" · ") : t("Not planned yet")} color={CYCLE_COLORS[cycleActivityOn(data.plan, today) ?? ""] ?? "#5b7083"} icon={<Target size={15} />} />
            <Tile label={al ? t(al.type.name) : t("Leave")} value={al ? `${al.remaining} ${t("days")}` : "—"} sub={al ? `${al.used} ${t("availed of")} ${al.quota}` : ""} color={COLORS.Leave} icon={<Bus size={15} />} />
          </div>

          <Section icon={<Target size={18} />} title="My Training State" sub={String(year)} actions={<Link className="btn btn-sm btn-ghost" href="/training/my">{t("Details")} <ArrowRight size={13} /></Link>}>
            <div className="my-trg">
              {trainingTypes.filter((x) => x.active).map((type) => (
                <div key={type.id} className="my-trg-row">
                  <strong>{t(type.name)}</strong>
                  <div className="seq-chips">
                    {Array.from({ length: type.frequency }, (_, i) => i + 1).map((n) => {
                      const st = seqStatus(type, me, data.training, n);
                      if (st.state === "Not Applicable") return null;
                      return <span key={n} className="seq-chip" style={{ background: resultColor(type, st.state), color: resultInk(type, st.state) }}>{t(seqName(type, n))}: {t(resultLabel(type, st.state))}{st.reason ? ` (${st.reason})` : ""}{st.last?.marks != null ? ` (${st.last.marks})` : ""}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<CalendarClock size={18} />} title="Daily Commitments">
            <div className="dash-grid three">
              <div className="panel">
                <h3>{t("Today's programme")}</h3>
                {data.prog.filter((p) => p.date === today).length === 0 ? <Empty>{t("No programme published")}</Empty> : (
                  <div className="timeline">{data.prog.filter((p) => p.date === today).sort((a, b) => String(a.time_from).localeCompare(String(b.time_from))).map((p) => (
                    <div className="tl-item" key={p.id}><span className="time-pill">{fmtTime(p.time_from)}</span><div><strong>{p.activity}</strong><small>{[p.venue, p.dress].filter(Boolean).join(" · ")}</small></div></div>
                  ))}</div>
                )}
              </div>
              <div className="panel">
                <h3>{t("My duties")}</h3>
                {data.duties.length === 0 ? <Empty>{t("No upcoming duties")}</Empty> : data.duties.map((d) => (
                  <div className="kv" key={d.id}><span>{d.duty_type}{d.shift ? ` (${d.shift})` : ""}</span><Badge tone={d.date === today ? "red" : "blue"}>{d.date === today ? t("Today") : fmtDate(d.date)}</Badge></div>
                ))}
                <h3 className="mt">{t("My leave")}</h3>
                {data.leave.filter((l) => ["Applied", "Recommended"].includes(l.status) || (l.status === "Approved" && l.to_date >= today && !l.rejoin_date)).length === 0 ? <span className="muted small">{t("No pending leave")}</span> :
                  data.leave.filter((l) => ["Applied", "Recommended"].includes(l.status) || (l.status === "Approved" && l.to_date >= today && !l.rejoin_date)).map((l) => (
                    <div className="kv" key={l.id}><span>{leaveTypes.find((x) => x.id === l.leave_type_id)?.code} {fmtDate(l.from_date)} – {fmtDate(l.to_date)}</span><Badge tone={l.status === "Approved" ? "green" : "amber"}>{t(l.status === "Approved" ? "Approved" : "Waiting for Coy Comd")}</Badge></div>
                  ))}
                {data.reqs.some((r) => r.status === "Pending") && <div className="kv"><span>{t("Profile update")}</span><Badge tone="amber">{t("Waiting for Coy Comd")}</Badge></div>}
              </div>
              <div className="panel">
                <h3>{t("Next 7 days")}</h3>
                {data.events.filter((e) => e.end_date >= today).length === 0 ? <Empty>{t("Nothing planned")}</Empty> : (
                  <div className="timeline">{data.events.filter((e) => e.end_date >= today).slice(0, 5).map((e) => (
                    <div className="tl-item" key={e.id}><span className="date-pill" style={{ background: colorFor(e.event_type) }}>{fmtDate(e.start_date, false)}</span><div><strong>{e.title}</strong><small>{t(e.event_type)}{e.venue ? ` · ${e.venue}` : ""}</small></div></div>
                  ))}</div>
                )}
                <NoticeMini notices={data.notices} />
              </div>
            </div>
          </Section>

          {perms.isOfficer && <Section icon={<Camera size={18} />} title="Daily Training Activities" actions={<Link className="btn btn-sm btn-ghost" href="/training/gallery">{t("All photos")} <ArrowRight size={13} /></Link>}>
            <PhotoStrip photos={data.photos} />
          </Section>}
        </>
      )}
    </div>
  );
}
