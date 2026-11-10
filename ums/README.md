# 5 Signal Battalion — Unit Management System (UMS)

A complete web system for running the unit: every soldier's personal file, leave,
daily parade state, training, daily activities and administration — used by
everyone from the CO down to the individual soldier, on desktop or mobile.

> **Version 3.5** — Cycle Plan table fixed (the four cycle columns); every training indicator has its own colour
> (Pass / Completed green, Fail red, Yet to complete amber, Exempted purple, Yet to appear light grey, Perm Atts dark slate)
> and every calendar event type too; continuous entries are drawn once as a bar from the first to the last day — leave,
> courses and repeated commitments on the Officers' Daily Commitments board (also in its PDF) and multi-day events in the
> Training Calendar.
>
> **Version 3.4** — modules follow the role table: Admin / CO / 2IC / Adjt and Coy Comd all modules (Coy Comd for his own
> coy); Coy Rep and Bn Rep Soldiers' Database, Parade State & Leave, Training, Daily Activities; **Clerk** Soldiers' Database,
> Training, Daily Activities and he now **enters daily commitments, the training calendar and notices on behalf of officers**
> ("By order of Adjt"); the individual gets **My Training** (his full training details) and can request a change to his
> **full information**. Duty roster names are highlighted (click a name to see all his duties of the week). Pages of a module
> that is not part of a login are blocked. Run `supabase/schema.sql` again on a live server (section 17).
>
> **Version 3.3** — the UMS is shown as **modules**: Soldiers' Database, Parade State & Leave, Training, Officers' Desk,
> Daily Activities and Administration. Each module has its own short menu, a **module switcher** in the sidebar and module cards on Home;
> the portal opens a module directly (`/go/?to=training`, after sign-in if needed). One login and one database as before;
> every page of the old menu is still there for every role.
>
> **Version 3.2.1** — runs under the **Unit Systems Portal** (port 8081) with an **All systems** button on the login page and top bar.
>
> **Version 3.2** — **changes are now kept in demo mode** (demo data moved to the browser's IndexedDB; localStorage was too
> small); **PDF / image attachments** on notices & orders; leave decided by the **Coy Comd**, **BHQ Pl and officers by the Adjt**;
> **Leave due** list — suggestion after 2 months 15 days and a red **3 months crossed** tag (Coy Rep, Coy Comd, Bn Rep, CO, 2IC,
> Adjt, Admin); Bangla uses **কোম্পানি**; **Speed March** as Completed / Yet to complete / Exempted; **personal vehicles** with
> licence and Stn HQ permission; **Officers' Daily Commitments** and **Officers' Tasks** (officer cards, details drawer, status
> Pending / In Progress / Completed / Overdue / On Hold); standard unit list (BHQ, HQ, Radio, Op, RR & Line, 106, 113, **121 BSC**,
> 205 ABSC) and officers' appointments (Adjt, QM, Coy Comd, 2IC, CO); new parade-state selector, equal boxes on the personal file.
>
> **Version 3.1.1** — fixes a crash when downloading a long PDF (e.g. Training State → All) whose rows run onto a second page.
>
> **Version 3.1** — fixes empty pages (soldiers database, training, calendar) in demo mode when a browser still held the
> demo data of an earlier version; equipment & weapon register and individual training plan removed; **training photos for
> officers only** (CO / 2IC / Adjt, Coy Comds, officers' own logins — only they view and upload); *History & Reports* is now a
> button on **Daily Parade State**; leave shown with a bus icon.
>
> **Version 3.0** — **My Tasks Today** on every home page; **Undo** instead of "Are you sure?"; **select many, act once**
> (soldiers, leave rejoin, approvals); **CO's Morning Brief** (one-page PDF) and one common layout for every PDF;
> **CSV upload** with a demo CSV format; **Individual Cycle Plan** (4 cycles × 3 months:
> Indl Training, Group Training, Unit Admin, Privilege Leave); last 3 **APR / OPR** in the personal file; **Living in**
> (Snk Lines / Family Quarter / Out Living); week **Sunday–Saturday** with Friday & Saturday shaded as holidays;
> **appointment logins** (Training Clerk, ORS, Coy Rep, Bn Rep, Coy Comd …) separate from the soldier's own ID, with hand-over
> history; Group Training as **Completed / On going / Yet to complete**; **Morning State + 2nd Parade State every day** and
> extra states (Durbar, Firing …) — the next day's states open at **1800 hrs** and close at **0300 hrs**; **CO's & officers'
> commitments** board for the Adjt; full-width screens and fixed overlapping boxes.
>
> **Version 2.3** — larger unit crest (no box) and a menu that folds to an icon rail; login page centred
> on the crest; new loading animation; Inter + Plus Jakarta Sans fonts bundled (offline).
>
> **Version 2.2** — **Bn Rep** role (BSM / Bn Daily) prepares the full battalion parade state; duty roster by
> Coy Rep and Bn Rep; age 45+ and Med Cat B/C/D automatically exempted from IPFT, RET and Speed March;
> quick soldier search (press `/`); military course results on the PDF sheet; cleaner screens; LAN server
> (`npm run lan`) and a hosting guide (**HOSTING.md**).
>
> **Version 2.1** — live date & clock, dark / light mode, **Apply for new ID** from the login page
> (Adjt approves), first-login profile completion, every personal-info field updatable (with Coy Comd
> approval for the soldier), distance from international boundary, coloured **PDF downloads** (sorted
> lists and a one-page personal file), Group Training as Completed / Not completed, company comparison.
> Builds on v2.0: role-based menus, single-step Coy Comd approvals, clickable dashboard charts, IPFT
> 1st/2nd Bi-Annual, training photo strip and English / বাংলা switch.
> Replaces the earlier *Parade State & Training Management System* (v9.x); see `SETUP.md`.

---

## Try it in 1 minute (demo mode)

```powershell
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys in `.env.local` the app runs in
**demo mode**: about 165 fictional soldiers, leave, courses, sick reports, duties,
training results and 10 days of parade-state history are generated in your browser.
Pick any role on the login page to sign in instantly. "Reset data" restores the demo.

---

## What's in it

| Area | What it does |
|---|---|
| **Home (dashboard)** | One screen per role. Staff see **Daily Parade State** (tiles + where-everyone-is donut + coy-wise columns + 14-day trend), **Training Parade State** (available for training, on external course, in cadre, instructors, excused), **Daily Commitments** (programme, duties, next 7 days, notices), **Yearly Training State** (IPFT 1st & 2nd Bi-Annual, RET, Spd March 1–4, Group Training, with a **Compare companies** chart and table for each) and a scrolling strip of **training photos**. **Click any tile, slice or bar to see the names** (and export them). The soldier sees his own day, service left, leave balance and training per period. |
| **Approvals** | One inbox for the Coy Comd (and Adjt/2IC/CO): leave applications and profile updates, with leave balance shown. |
| **Soldiers database** | Full nominal roll with filters for age, service length, service left, height, home district, **distance from international boundary**, trade, rank, blood group, medical category and more; column chooser, breakdowns, Excel export. Personal file with family, education, courses, postings, discipline, awards, medical, leave, training, audit trail. **Remove from coy** with reason (record kept). |
| **Leave** | Soldier (or Coy Rep on his behalf) applies → **Coy Comd approves** (Coy Comd's own leave → Adjt/2IC/CO) → Coy Rep reports rejoin. Balances, overlap check, overstay alerts, register export. |
| **Daily Parade State** | Auto-filled from leave, courses, hospital, attachments and duty roster; coy submits, Adjt accepts/finalizes, 2nd State; history, trend, A4 print report with nominal rolls. |
| **Training** | Tests with named periods (IPFT **1st / 2nd Bi-Annual**, Spd March 1–4, RET, **Group Training** as Completed / On going / Yet to complete). Training State by period with charts; quick / batch / Excel entry; calendar; courses & cadres; **training photo gallery** (officers only). |
| **Daily** | Daily programme (commitments), duty roster, notices & orders. |
| **Admin** | Sick report / MI room, user accounts (Coy Comd manages his coy's logins), settings, import/export, audit log. |
| **My Tasks Today** (v3.0) | Top of every home page: what this login must do today, worked out from the data — submit / accept / finalize the open parade states (with closing time), decide leave and profile updates, mark rejoin, detail tomorrow's duties, publish tomorrow's programme, record today's results, plan cycles; the Adjt also sees the CO's commitments today. Done items tick themselves off. |
| **Parade states** (v3.0) | **Morning State** and **2nd Parade State** open by themselves every day; Adjt / Bn Rep / Admin can open more (**Durbar, Firing, Roll Call …**), starting empty or copied from another state. The next day's states open at **1800 hrs** the evening before and are **finalized automatically at 0300 hrs** (24 Oct state: opens 1800 hrs 23 Oct, closes 0300 hrs 24 Oct). Times are set in *Settings → Unit → Parade state times*. |
| **Cycle Plan** (v3.0) | *Training → Cycle Plan*: the Coy Comd plans, at the start of the year, which of the four 3-month cycles each JCO / OR spends on **Indl Training, Group Training, Unit Admin and Privilege Leave** (each once). Colour grid, checks for missing / repeated activities, one-click balanced plan, bulk patterns, per-cycle coy summary, Excel / PDF. The soldier sees *This cycle* on his home page and file. |
| **Officers' Commitments** (v3.0) | For CO / 2IC / Adjt: a Sunday–Saturday board of the CO's and every officer's commitments (entered by the Adjt), plus duty officer, leave and courses filled in automatically. |
| **CO's Morning Brief** (v3.0) | One-page PDF from *My Tasks Today*: coy-wise state, AWOL / overstay / hospital, leave out & due back, CO's and officers' commitments, programme, duties, training %, approvals waiting, retirements. |
| **Undo & bulk** (v3.0) | Deleting a duty, programme item, notice, result, course, plan item, commitment or record happens at once with an **Undo** button for 8 seconds. Tick many rows and act once: soldiers (set living in, nominate for course, detail for duty, Excel / PDF of the selection), leave (mark rejoined), approvals (approve / reject). |
| **Language & look** | **EN / বাংলা** switch on every screen (and the login page). Names show in Bangla where "Name (Bangla)" is recorded. Bangla font is bundled, so it works without internet access. **Dark / light mode** (follows the device until changed) and a live Bangladesh date & clock in the top bar. |
| **New ID** | **Apply for new ID** on the login page: the soldier fills in all his personal information and chooses a password; the **Adjt** (or 2IC / CO) approves in *Approvals → New ID* — he is added to the database and can sign in with his Personal No. Personal No must be unique (spaces and capitals ignored). |
| **First login** | A soldier whose file is missing personal information must fill it in before using the system (only empty fields; existing data still changes through approval). |
| **PDF** | Every list with an Excel button also has **PDF** (soldiers database with current filters and sort, drill-down lists, training state, leave register, courses, sick report, parade state history). **Download PDF** on a personal file gives a coloured one-page information sheet. |

Colours mean the same everywhere — e.g. green = present / pass, red = absent / fail,
teal = leave, purple = course, amber = exempted, grey = yet to appear.

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Adjt / 2IC / CO** (and Admin) | Whole unit | **Super admin** — everything: approvals, parade state finalize, settings, all logins |
| **Coy Comd** | Own coy | **Admin of his coy** — approves leave and profile updates, coy training plan, coy programme / calendar / notices, coy logins, plus all Coy Rep work |
| (all staff above) | | Clerk, Coy Rep, Coy Comd and Adjt / 2IC / CO can update **all personal info** directly; Adjt / 2IC / CO also approve **new ID** applications |
| **Bn Rep** (BSM / Bn Daily) | Whole unit (view) | Prepares the **full battalion parade state** — edits every coy, accepts / returns coy states, starts the 2nd State (Adjt finalizes); duty roster for all coys |
| **Appointment logins** (v3.0) | — | Staff roles (Training Clerk, ORS Clerk, Coy Rep, Coy Comd, Bn Rep, Adjt …) sign in with a login that belongs to the **appointment**, not to a soldier: no personal file, only the name of whoever holds the duty now. *User Accounts → Hand over* changes the holder (and the password) and keeps the history. Every soldier — clerks included — keeps **one individual ID** (his Personal No) for his own file and leave. |
| **Coy Rep** | Own coy | Daily parade state, add / update / remove coy soldiers, training results, leave on behalf & rejoin, duties, sick report |
| **Clerk** | Whole unit | View & sort everything; updates personal info and training records (no approvals, no parade state) |
| **Individual soldier** | Himself | Requests updates to **any** personal info and applies for leave (→ his Coy Comd); downloads his file as PDF; sees daily commitments, duties, his training and notices |

Every rule is enforced **in the database** (PostgreSQL Row Level Security and
server-side functions), not only by hiding buttons.

---

## Hosting

Free options — your own LAN server or free online hosting — are explained step by step in **HOSTING.md**.
Quick LAN start on any PC: `npm run lan` → open the printed `http://<ip>:8080` on other computers/phones.

---

## Technology

- **Next.js 15 + React 19 + TypeScript**, static export → **Firebase Hosting** (or any static host)
- **Supabase**: PostgreSQL, Auth, Row Level Security, Storage (photos), one Edge Function (`manage-users`)
- `xlsx` for Excel, `jspdf` + `jspdf-autotable` for PDF, `lucide-react` icons

```
app/                 pages (one folder per screen)
components/          app shell, UI kit, soldier profile
lib/
  api.ts             all database calls
  compute.ts         parade totals, leave balance, training status
  constants.ts       field definitions, districts, roles
  colors.ts          one colour per meaning
  i18n.tsx, i18n-bn.ts  English / Bangla
  session.tsx        logged-in user, permissions, reference data
  demo/              in-browser demo backend + generated data
supabase/
  schema.sql         complete database (run once)
  BOOTSTRAP_FIRST_ADMIN.sql
  functions/manage-users/   Edge Function for logins
  tests/             automated permission & workflow tests for schema.sql (99 checks)
```

---

## Security notes

- Personal data of soldiers is sensitive. **Make the GitHub repository private** and
  never commit `.env.local` or exported backups.
- Disable public sign-ups in Supabase (Authentication → Providers → Email → *Allow new users to sign up*: off). Accounts are created only through **User Accounts**.
- The Supabase **service-role key** lives only inside the Edge Function, never in the web app.
- Photos are in a **private** storage bucket and served with short-lived signed links.

---

## Developer / Maintainer

**© BA 11108 Capt Asif Mahmud, Sigs** — 5 Signal Battalion. Internal / authorized use only.
