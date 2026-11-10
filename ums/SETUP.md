# Setup guide — going live

About 30–45 minutes. You need: a Supabase account, a Firebase project (you already
have one), Node.js 20+, and PowerShell / a terminal.

> This is a **new database design**. Use a **new Supabase project** so the old v9
> system keeps working until you switch over.
>
> **Already running UMS v2.1?** Unzip v2.2 into a new folder, copy `.env.local`, run `npm install`
> (or just `npm run dev` — missing packages are now installed automatically). Run the new
> `supabase/schema.sql` once (adds the Bn Rep role and the exemption rule) and **redeploy
> `manage-users`** so Bn Rep logins can be created.
>
> **Already running UMS v2.0?** Unzip v2.1 into a new folder, copy `.env.local` across, run
> `npm install`. Then run the new `supabase/schema.sql` once in the SQL Editor (keeps all data;
> adds distance from IB, unique Personal No, new ID applications; switches Group Training to
> Completed / Not completed, hides Swimming and removes 2Lt — once only) and **redeploy
> `manage-users`** (step 3) — it now also approves new ID applications.
>
> **Already running UMS v1.0?** Just run the new `supabase/schema.sql` again in the SQL
> Editor and redeploy `manage-users` (step 3). It keeps all data and adds the v2 rules,
> IPFT bi-annual names, Group Training and the training-photos table/bucket.
> Note the v2 role model: Clerks are now unit-wide (their company is ignored), and leave is
> approved by the Coy Comd in one step.

---

## 1. Create the Supabase project

1. https://supabase.com → **New project** (region: Singapore is closest to Bangladesh).
2. **SQL Editor → New query** → paste the whole of `supabase/schema.sql` → **Run**.
   It creates every table, rule and function, plus default companies, leave types,
   training tests and lists. It is safe to run again later.
3. **Authentication → Providers → Email**:
   - *Allow new users to sign up*: **OFF** (accounts are created by the clerk/admin)
   - *Confirm email*: **OFF**
4. **Authentication → URL Configuration**: set *Site URL* to your Firebase address
   (e.g. `https://your-project.web.app`).

## 2. Create the first Admin

1. **Authentication → Users → Add user → Create new user**
   - Email: your Personal No in lower case without spaces + `@5sigbn.local`
     (e.g. `BA 11108` → `ba11108@5sigbn.local`)
   - Password: a strong password · tick **Auto Confirm User**
2. Open `supabase/BOOTSTRAP_FIRST_ADMIN.sql`, change the email/name, run it in the SQL Editor.

## 3. Deploy the `manage-users` Edge Function

This function creates soldier logins and resets passwords (it needs the
service-role key, which must never be in the web app).

```powershell
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy manage-users
# optional, only if you change the login domain:
supabase secrets set LOGIN_EMAIL_DOMAIN=5sigbn.local
```

(`YOUR_PROJECT_REF` is in Project Settings → General.)

## 4. Configure the web app

Copy `.env.example` to `.env.local` and fill in (Project Settings → API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=5sigbn.local
```

```powershell
npm install
npm run dev
```

Open http://localhost:3000 and sign in with your Personal No and password. The
status at the bottom of the menu should say **Connected · Supabase**.

## 5. Load your data

1. **Administration → Settings**: check companies, ranks, trades, duty types;
   set **leave entitlements** and (optionally) **retirement rules** per current regulations.
2. **Administration → Import / Export → Demo CSV format** (or Excel template). Fill one row per soldier
   from your existing nominal roll, save as **CSV UTF-8** (keeps Bangla names) or .xlsx, upload → check → **Import**.
   Re-importing later updates soldiers by Personal No. Coy Comds and Coy Reps can upload their own coy
   (*Upload soldiers (CSV)* in their menu).
2a. **Training → Cycle Plan** (each Coy Comd, at the start of the year): plan the four cycles for every JCO / OR —
   *Auto-plan whole coy* gives a balanced start, then adjust.
3. **User Accounts → New appointment login**: create one login per appointment (CO, 2IC, Adjt,
   OC each coy, each Coy Rep, Bn Rep for the BSM / Bn Daily, Training Clerk, ORS Clerk …) with a short fixed
   login ID such as `trg-clk` or `rdo-rep`, and pick who holds it now. When the duty changes hands use
   **Hand over** (set a new password at the same time). These logins have no personal file.
4. **User Accounts → Create soldier logins in bulk** (Adjt), or **Coy Logins** (each Coy Comd
   for his own coy): one click with a common temporary password. Each soldier signs in with
   his Personal No, must set his own password, and then fills in any personal information
   missing from his file. New arrivals can instead use **Apply for new ID** on the login page;
   the Adjt approves them in Approvals → New ID.
5. Coy Comds (and CO / 2IC / Adjt) upload daily training photos in **Training Photos** — only officers can see them.
6. Optional: enter this year's training results via **Record Results → Excel import**
   (the *sequence* column accepts a number or a name such as `2nd Bi-Annual`).

## 6. Publish (free) — see HOSTING.md for LAN server and other free hosts

```powershell
npm run build          # creates the out/ folder
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only hosting
```

`firebase.json` is already set to serve `out/`. (Copy `.firebaserc.example` to
`.firebaserc` if you are on a new machine.)

---

## Updating to a new version

1. Unzip the new version into a **new folder** (don't unzip over the old one).
2. Copy your `.env.local` from the old folder into the new one.
3. In the new folder run `npm install`, then `npm run dev` (or `npm run build` to publish).
4. If the release notes say so, run the new `supabase/schema.sql` once in the SQL Editor — it keeps all data.
5. **From v3.1 to v3.2**: run the new `schema.sql` once (notice attachments + `notice-files` bucket, BHQ Pl leave to the Adjt,
   Speed March as Completed / Yet to complete, officers' tasks, 121 BSC, officers' appointments). Then *Settings → Companies →
   Apply standard unit list* (safe to press again; it never deletes anything).
6. **From v3.0 to v3.1**: run the new `schema.sql` once (training photos become officers-only). The v3.0 equipment tables are no longer used.
7. **From v2.x to v3.x**: run the new `schema.sql` (renames *1st State* → *Morning State*, *2nd State* → *2nd Parade State*,
   turns existing staff logins into appointment logins and frees their soldier records for individual logins) and
   **redeploy `manage-users`**. Optional: enable the `pg_cron` extension (Database → Extensions) so states are finalized at
   0300 hrs even when nobody opens the app — without it they are finalized the next time anyone opens the parade state.

## Daily routine (for the Orderly Room)

| When | Who | What |
|---|---|---|
| Evening 1800 hrs | (automatic) | Tomorrow's **Morning State** and **2nd Parade State** open |
| Before 0300 hrs | Coy Rep | **Morning State** → check pre-filled lines → correct → **Submit** (it closes and is finalized at 0300 hrs) |
| Any time | Coy Comd | **Approvals** — leave and profile updates from his soldiers |
| Any time | Adjt | **Approvals → New ID** — check the details a new soldier submitted, pick his coy, approve |
| Morning | Bn Rep (BSM / Bn Daily) | Checks every coy, corrects lines, accepts / returns coy states, updates the duty roster |
| Morning | Adjt / CO | **My Tasks Today → CO's Morning Brief** (one-page PDF) |
| Before 1500 hrs | Coy Rep / Bn Rep | **2nd Parade State** (use *Copy lines from… Morning State*) → submit; closes 1500 hrs |
| On order | Adjt / Bn Rep | **+ Open another state** (Durbar, Firing, Roll Call …) with its own closing time |
| Any time | Adjt | **Officers' Commitments** — keep the CO's and officers' programme up to date |
| Any time | Clerk / Coy staff | Leave rejoin, sick report, duty roster, course nominations — the next parade state picks these up automatically |
| Weekly | Coy Comd | Training Status → chase *yet to appear*; Approvals |

## Troubleshooting

- **"Could not reach the manage-users Edge Function"** — step 3 not done, or deployed to another project.
- **Login says wrong Personal No or password** — the login email must be `<personalno>@5sigbn.local`
  (lower case, no spaces). Reset the password from User Accounts.
- **A soldier cannot see something** — check his role and company in User Accounts → Role.
- **"Approve & create ID" fails** — redeploy `manage-users` (v2.1 adds this action). If it says the
  login already exists, that Personal No already has an account: reset its password instead.
- **"Personal No ... differ only by spaces or case"** notice when running schema.sql — two soldiers
  have the same Personal No written differently (e.g. `BA 1234` and `ba1234`). Correct one, run again.
- **Parade state shows someone absent who is back** — mark the leave **Rejoin** (or discharge
  in Sick Report), then **Refresh auto** on the parade state. Lines edited by hand are marked
  *Manual*; use the reset icon to return them to automatic.

## Testing the database rules (optional, for developers)

```powershell
cd supabase/tests
npm install
node rls-test.mjs ../schema.sql
```

Runs the schema in an in-memory PostgreSQL and checks 139 permission and workflow
cases (who can see/edit what, leave chain, parade-state auto-fill, approvals).
