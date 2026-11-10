"use client";

// "My Tasks Today" — what this login has to do today, worked out from the data (nothing to type in).
import Link from "next/link";
import { useMemo } from "react";
import {
  BadgeCheck, CalendarCheck, CalendarClock, CheckCircle2, Circle, ClipboardCheck, FileText, GraduationCap, Bus, Repeat, ShieldCheck, Target, UserCircle, UserPlus,
} from "lucide-react";
import { useAction, useAsync } from "./ui";
import {
  ensureParadeStates, getParadeStatesForDate, listChangeRequests, listCommitments, listOfficerTasks, listCyclePlans, listDuties, listIdApplications, listLeave,
  listProgrammes, listSubmissions, listTrainingEvents,
} from "@/lib/api";
import { isOverstayed, leaveDue } from "@/lib/compute";
import { cycleOf, taskState } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { exportMorningBrief } from "@/lib/reports";
import { useSession } from "@/lib/session";
import { addDays, bdToday, cls, currentYear, fmtTime, isWeekend } from "@/lib/utils";

interface Task { key: string; icon: React.ReactNode; text: string; sub?: string; href?: string; done?: boolean; tone?: "red" | "amber" | "blue" | "green"; due?: string }

export function MyTasks() {
  const session = useSession();
  const { perms, myCompanies, directory, directoryById, companyById, profile } = session;
  const { t } = useI18n();
  const { busy, run } = useAction();
  const today = bdToday();
  const tomorrow = addDays(today, 1);
  const year = currentYear();
  const editCoys = myCompanies.filter((c) => perms.canEditCompany(c.id));
  const cmdCoys = myCompanies.filter((c) => perms.canCommandCompany(c.id));

  const { data } = useAsync(async () => {
    try { await ensureParadeStates(today); } catch { /* view only */ }
    const states = await getParadeStatesForDate(today);
    const now = new Date().toISOString();
    const live = states.filter((s) => s.status === "Open" && (!s.opens_at || s.opens_at <= now));
    const [subs, leave, reqs, apps, dutiesTmrw, progTmrw, events, plans, commits, otasks] = await Promise.all([
      live.length ? listSubmissions(live.map((s) => s.id)) : Promise.resolve([]),
      perms.canSeeLeaveDue ? listLeave() : listLeave({ from: addDays(today, -60), to: addDays(today, 30) }),
      perms.canApproveAny ? listChangeRequests({ status: "Pending" }).catch(() => []) : Promise.resolve([]),
      perms.isSuper ? listIdApplications("Pending").catch(() => []) : Promise.resolve([]),
      perms.canParadeAny ? listDuties(tomorrow, tomorrow) : Promise.resolve([]),
      cmdCoys.length ? listProgrammes(tomorrow, tomorrow) : Promise.resolve([]),
      listTrainingEvents(today, today),
      cmdCoys.length ? listCyclePlans(year).catch(() => []) : Promise.resolve([]),
      perms.isSuper ? listCommitments(today, today).catch(() => []) : Promise.resolve([]),
      perms.canOfficersDesk ? listOfficerTasks().catch(() => []) : Promise.resolve([]),
    ]);
    return { live, subs, leave, reqs, apps, dutiesTmrw, progTmrw, events, plans, commits, otasks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const tasks = useMemo<Task[]>(() => {
    if (!data) return [];
    const out: Task[] = [];
    const clock = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(":", "") + " hrs" : "");

    // parade states that are open now
    for (const st of data.live) {
      const coys = myCompanies.filter((c) => perms.canParadeCompany(c.id));
      if (perms.isParadeMaster) {
        const waiting = data.subs.filter((s) => s.parade_state_id === st.id && s.status === "Submitted").length;
        const notIn = myCompanies.filter((c) => !data.subs.some((s) => s.parade_state_id === st.id && s.company_id === c.id && ["Submitted", "Accepted"].includes(s.status))).length;
        out.push({ key: `pm-${st.id}`, icon: <ClipboardCheck size={15} />, text: waiting ? `${t("Accept")} ${waiting} ${t("coy state(s)")} — ${t(st.state_type)}` : notIn ? `${t(st.state_type)}: ${notIn} ${t("coy(s) not submitted yet")}` : `${t("Finalize")} ${t(st.state_type)}`,
          sub: st.closes_at ? `${t("closes")} ${clock(st.closes_at)}` : undefined, href: `/parade-state?state=${st.id}`, tone: waiting ? "amber" : notIn ? "blue" : "green", done: false });
      } else {
        for (const c of coys) {
          const sub = data.subs.find((s) => s.parade_state_id === st.id && s.company_id === c.id);
          const done = !!sub && ["Submitted", "Accepted"].includes(sub.status);
          out.push({ key: `ps-${st.id}-${c.id}`, icon: <ClipboardCheck size={15} />, text: `${t("Submit")} ${t(st.state_type)} — ${c.short_name}`, sub: sub?.status === "Returned" ? t("Returned — correct and submit again") : done ? t(sub!.status) : st.closes_at ? `${t("closes")} ${clock(st.closes_at)}` : undefined,
            href: `/parade-state?state=${st.id}&coy=${c.id}`, done, tone: sub?.status === "Returned" ? "red" : "amber" });
        }
      }
    }
    // approvals
    const pendingLeave = data.leave.filter((l) => ["Applied", "Recommended"].includes(l.status) && perms.isMyLeaveToDecide(l.company_id, l.soldier_id));
    if (perms.canApproveAny) {
      out.push({ key: "appr", icon: <BadgeCheck size={15} />, text: pendingLeave.length + data.reqs.length ? `${t("Decide")} ${pendingLeave.length} ${t("leave")} · ${data.reqs.length} ${t("profile update(s)")}` : t("No approval waiting"), href: "/approvals", done: !(pendingLeave.length + data.reqs.length), tone: "amber" });
      if (data.apps.length) out.push({ key: "apps", icon: <UserPlus size={15} />, text: `${data.apps.length} ${t("new ID application(s) to verify")}`, href: "/approvals", tone: "amber" });
    }
    // leave: due back / overstayed
    if (perms.canOperateAny) {
      const dueBack = data.leave.filter((l) => perms.canOperateCompany(l.company_id) && l.status === "Approved" && !l.rejoin_date && l.to_date === addDays(today, -1));
      const over = data.leave.filter((l) => perms.canOperateCompany(l.company_id) && isOverstayed(l, today) && l.to_date < addDays(today, -1));
      if (dueBack.length) out.push({ key: "back", icon: <Bus size={15} />, text: `${t("Mark rejoin")}: ${dueBack.map((l) => { const d = directoryById.get(l.soldier_id); return d ? `${d.rank} ${d.name.split(" ").slice(-1)[0]}` : ""; }).join(", ")}`, sub: t("leave ended yesterday"), href: "/leave", tone: "blue" });
      if (over.length) out.push({ key: "over", icon: <Bus size={15} />, text: `${over.length} ${t("overstayed leave — report / take action")}`, href: "/leave", tone: "red" });
    }
    // leave due every 3 months
    if (perms.canSeeLeaveDue) {
      const ids = directory.filter((d) => d.status === "Serving" && perms.canViewCompany(d.company_id) && (perms.canViewAll || myCompanies.some((c) => c.id === d.company_id))).map((d) => d.id);
      const due = leaveDue(data.leave, ids, today).filter((d) => !d.planned && d.level !== "none");
      const crossed = due.filter((d) => d.level === "crossed").length;
      if (due.length) out.push({ key: "ldue", icon: <Bus size={15} />, text: `${t("Leave due")}: ${due.length - crossed} · ${t("3 months crossed")}: ${crossed}`, sub: t("no leave planned yet"), href: "/leave?tab=due", tone: crossed ? "red" : "amber" });
    }
    // tomorrow's duties & programme
    if (perms.canParadeAny) {
      const rosterCoys = perms.isBnRep || perms.isSuper ? null : myCompanies.filter((c) => perms.canRosterCompany(c.id)).map((c) => c.id);
      const mine = data.dutiesTmrw.filter((d) => !rosterCoys || rosterCoys.includes(d.company_id ?? ""));
      if (perms.isBnRep || perms.isSuper || rosterCoys?.length) out.push({ key: "roster", icon: <ShieldCheck size={15} />, text: mine.length ? `${t("Duties for tomorrow detailed")} (${mine.length})` : t("Detail duties for tomorrow"), href: "/daily/duty-roster", done: mine.length > 0, tone: "blue" });
    }
    if (cmdCoys.length && !isWeekend(tomorrow)) {
      const n = data.progTmrw.filter((p) => !p.company_id || cmdCoys.some((c) => c.id === p.company_id)).length;
      out.push({ key: "prog", icon: <CalendarClock size={15} />, text: n ? `${t("Tomorrow's programme published")} (${n})` : t("Publish tomorrow's programme"), href: "/daily/programme", done: n > 0, tone: "blue" });
    }
    // training events today → record results
    const ev = data.events.filter((e) => e.status !== "Cancelled" && (!e.company_id || perms.canEditCompany(e.company_id)) && e.training_type_id);
    if (editCoys.length && ev.length) out.push({ key: "trg", icon: <Target size={15} />, text: `${t("Record results")}: ${ev.map((e) => e.title).join(", ")}`, href: "/training/entry", tone: "blue" });
    // cycle plan
    if (cmdCoys.length) {
      const pool = directory.filter((d) => d.status === "Serving" && d.category !== "Offr" && cmdCoys.some((c) => c.id === d.company_id));
      const planned = new Set(data.plans.filter((p) => p.c1 && p.c2 && p.c3 && p.c4).map((p) => p.soldier_id));
      const missing = pool.filter((d) => !planned.has(d.id)).length;
      if (missing) out.push({ key: "cycle", icon: <Repeat size={15} />, text: `${missing} ${t("soldier(s) without a full cycle plan for")} ${year}`, href: "/training/cycle-plan", tone: cycleOf(today) === 1 ? "amber" : "blue" });
    }
    // officers' tasks: own open tasks (Adjt / 2IC / CO: overdue tasks of all officers)
    if (perms.canOfficersDesk) {
      const me = [profile.soldier_id, profile.held_by_soldier].filter(Boolean) as string[];
      const openT = data.otasks.filter((x) => x.status !== "Completed" && x.status !== "On Hold");
      const own = openT.filter((x) => x.assigned_to.some((a) => me.includes(a)));
      const overdue = (l: typeof openT) => l.filter((x) => taskState(x, today) === "Overdue").length;
      if (own.length) out.push({ key: "otask", icon: <ClipboardCheck size={15} />, text: `${t("My open tasks")}: ${own.length}${overdue(own) ? ` · ${overdue(own)} ${t("overdue")}` : ""}`, href: "/daily/officer-tasks", tone: overdue(own) ? "red" : "blue" });
      if (perms.isSuper && overdue(openT)) out.push({ key: "otask-all", icon: <ClipboardCheck size={15} />, text: `${t("Officers' tasks overdue")}: ${overdue(openT)}`, href: "/daily/officer-tasks", tone: "red" });
    }
    // CO's commitments today (Adjt / 2IC / CO)
    if (perms.isSuper) {
      const offrs = directory.filter((d) => d.category === "Offr" && d.status === "Serving");
      const co = offrs.find((d) => /^Lt Col/i.test(d.rank)) ?? offrs[0];
      const coToday = data.commits.filter((c) => c.soldier_id === co?.id).sort((a, b) => String(a.time_from).localeCompare(String(b.time_from)));
      out.push({ key: "co", icon: <CalendarCheck size={15} />, text: coToday.length ? `${t("CO today")}: ${coToday.map((c) => `${c.time_from ? fmtTime(c.time_from) + " " : ""}${c.title}`).join(" · ")}` : t("No commitment recorded for the CO today"), href: "/daily/commitments", tone: "blue", done: false });
    }
    return out;
  }, [data, perms, myCompanies, directory, directoryById, t, today, tomorrow, year, editCoys, cmdCoys]);

  if (!data) return null;
  const open = tasks.filter((x) => !x.done).length;
  return (
    <section className="tasks-card">
      <div className="tasks-head">
        <div><h2>{t("My Tasks Today")}</h2><p>{open ? `${open} ${t("to do")}` : t("All done for now")}{profile.company_id ? ` · ${companyById.get(profile.company_id)?.short_name ?? ""}` : ""}</p></div>
        {(perms.isSuper || perms.isBnRep) && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => exportMorningBrief(session), "Morning Brief downloaded")}><FileText size={14} /> {t("CO's Morning Brief")}</button>}
      </div>
      {tasks.length === 0 ? <p className="muted small">{t("Nothing needs your action today.")}</p> : (
        <ul className="tasks">
          {tasks.map((x) => {
            const body = (
              <>
                <span className={cls("task-check", x.done && "done")}>{x.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span>
                <span className="task-icon">{x.icon}</span>
                <span className="task-text"><strong>{x.text}</strong>{x.sub && <small>{x.sub}</small>}</span>
              </>
            );
            return <li key={x.key} className={cls("task", x.done && "done", !x.done && x.tone && `tone-${x.tone}`)}>{x.href ? <Link href={x.href}>{body}</Link> : <div>{body}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

/** Soldier's own list: duty, leave, requests, this cycle. */
export function MySoldierTasks({ duties, leave, reqs, cycle, profileMissing }: {
  duties: Array<{ id: string; date: string; duty_type: string; shift: string | null }>;
  leave: Array<{ id: string; status: string; from_date: string; to_date: string; rejoin_date?: string | null }>;
  reqs: Array<{ status: string }>;
  cycle: string | null;
  profileMissing: number;
}) {
  const { t } = useI18n();
  const today = bdToday();
  const tomorrow = addDays(today, 1);
  const tasks: Task[] = [];
  for (const d of duties.filter((x) => x.date === today || x.date === tomorrow))
    tasks.push({ key: d.id, icon: <ShieldCheck size={15} />, text: `${d.duty_type}${d.shift ? ` (${d.shift})` : ""}`, sub: d.date === today ? t("Today") : t("Tomorrow"), tone: d.date === today ? "red" : "amber", href: "/daily/duty-roster" });
  const back = leave.find((l) => l.status === "Approved" && !l.rejoin_date && l.to_date === addDays(today, -1));
  if (back) tasks.push({ key: "rejoin", icon: <Bus size={15} />, text: t("Report back from leave today"), tone: "amber", href: "/leave" });
  const waiting = leave.filter((l) => ["Applied", "Recommended"].includes(l.status)).length;
  if (waiting) tasks.push({ key: "lv", icon: <Bus size={15} />, text: `${waiting} ${t("leave application(s) waiting for Coy Comd")}`, tone: "blue", href: "/leave" });
  if (reqs.some((r) => r.status === "Pending")) tasks.push({ key: "req", icon: <UserCircle size={15} />, text: t("Profile update waiting for Coy Comd"), tone: "blue", href: "/my-profile" });
  if (profileMissing) tasks.push({ key: "prof", icon: <UserCircle size={15} />, text: `${profileMissing} ${t("field(s) missing in your personal information")}`, tone: "amber", href: "/my-profile" });
  if (cycle) tasks.push({ key: "cyc", icon: <GraduationCap size={15} />, text: `${t("This cycle")}: ${t(cycle)}`, tone: "green", done: false });
  return (
    <section className="tasks-card">
      <div className="tasks-head"><div><h2>{t("My Tasks Today")}</h2><p>{tasks.some((x) => x.key !== "cyc") ? `${tasks.filter((x) => x.key !== "cyc").length} ${t("to do")}` : t("Nothing for you today")}</p></div></div>
      {tasks.length > 0 && (
        <ul className="tasks">{tasks.map((x) => {
          const body = <><span className="task-check"><Circle size={17} /></span><span className="task-icon">{x.icon}</span><span className="task-text"><strong>{x.text}</strong>{x.sub && <small>{x.sub}</small>}</span></>;
          return <li key={x.key} className={cls("task", x.tone && `tone-${x.tone}`)}>{x.href ? <Link href={x.href}>{body}</Link> : <div>{body}</div>}</li>;
        })}</ul>
      )}
    </section>
  );
}
