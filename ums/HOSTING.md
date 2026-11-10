# Hosting the system — free options

The app has two parts:

| Part | What it is | Where it can run |
|---|---|---|
| **Web app** | The pages (the `out/` folder after `npm run build`) | Any web server — your own PC/server on the LAN, or free static hosting |
| **Database** | Supabase: logins, data, photos, the `manage-users` function | Supabase cloud (free plan) **or** your own server (Docker, free) |

> **Demo mode is not for real use.** Without Supabase keys every browser keeps its own
> separate test data. For the unit, always connect a Supabase database (option A or B).

> **Security:** this is personal data of serving soldiers. Check your formation / Army IT
> security instructions before putting it on the internet. Option A (LAN only) keeps
> everything inside the unit.

---

## Option A — Office LAN only, on your own server (fully offline)

**Is it really offline?** Yes. Everything runs on your server:

| Piece | What it is | Where the data lives |
|---|---|---|
| Database | **PostgreSQL 15** — a full server database (same class as Oracle / SQL Server, free and open source; far stronger than SQLite for many users at once) | `supabase/docker/volumes/db/data` on your server |
| Logins | Supabase Auth (GoTrue), on your server | inside the same PostgreSQL |
| Photos | Supabase Storage, on your server | `supabase/docker/volumes/storage` |
| `manage-users` | Edge Function — its library is bundled in the folder, it downloads nothing | — |
| Web pages | `out/` folder served by `npm run serve` (Node only, no extra packages) | — |
| Bangla font, icons, Excel, PDF | All bundled in the app | — |

Internet is needed **only once**, to download the installers — and that can be done on another
PC and carried on a USB drive (see "A0" below). After that the server and every client can stay
completely disconnected from the internet.

### A0. (Optional) Prepare everything on an internet PC and carry it by USB
On any PC with internet and Docker:
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
docker compose pull
docker save -o supabase-images.tar $(docker compose config --images)
```
Also download the **Docker** and **Node.js 20 LTS** installers. In the UMS folder create `.env.local`
with the server's LAN address (A3), then run `npm run build` — this makes the `out/` folder.
Copy to the USB drive: the installers, the `supabase/docker` folder (with `supabase-images.tar`),
and the UMS folder (including `out/`).
On the offline server: install Docker and Node, then `docker load -i supabase-images.tar` and continue with A2.

> The web address of the database is built into the pages, so build with the **final** server IP.
> If the IP changes, change `.env.local` and run `npm run build` again.

Server: any always-on PC or server with **8 GB RAM or more**, Windows 10/11 or Ubuntu 22.04+.
All computers and phones on the unit LAN / Wi-Fi open `http://SERVER-IP:8080`.

### A1. Install once (needs internet only for this step — or use A0)
1. **Docker** — Ubuntu: `curl -fsSL https://get.docker.com | sh` · Windows: Docker Desktop.
2. **Node.js 20 LTS** — https://nodejs.org
3. **Git** — https://git-scm.com

### A2. Run your own Supabase (database + logins)
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```
Edit `.env`:
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD` — set your own
  (the Supabase self-hosting guide shows how to generate the two keys from `JWT_SECRET`).
- `SITE_URL=http://SERVER-IP:8080` and `API_EXTERNAL_URL=http://SERVER-IP:8000`
- `DISABLE_SIGNUP=true` and `ENABLE_EMAIL_AUTOCONFIRM=true`

Copy the Edge Function into the self-hosted functions folder, then start:
```bash
mkdir -p volumes/functions/manage-users
cp /path/to/5sigbn-ums/supabase/functions/manage-users/* volumes/functions/manage-users/
docker compose up -d
```
Open **Studio** at `http://SERVER-IP:8000` (user `supabase`, your `DASHBOARD_PASSWORD`):
1. **SQL Editor** → paste all of `supabase/schema.sql` → Run.
2. **Authentication → Users → Add user** for your first admin, then run `supabase/BOOTSTRAP_FIRST_ADMIN.sql`
   (see SETUP.md step 2).
3. (Recommended) **Database → Extensions → pg_cron → Enable**, then run `schema.sql` once more. The parade states
   are then finalized exactly at 0300 hrs by the server itself (everything stays on your server).

### A3. Run the web app on the same server
In the project folder create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://SERVER-IP:8000
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your ANON_KEY>
NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=5sigbn.local
```
```bash
npm install
npm run lan
```
It prints the LAN address, e.g. `http://192.168.1.10:8080`. Give that address to everyone
(bookmark it / "Add to Home screen" on phones).

**Start automatically after a power cut**
- Docker containers restart by themselves (`restart: unless-stopped` is already in Supabase's compose file).
- Web app — Ubuntu: `npm i -g pm2 && pm2 start "npm run serve" --name ums && pm2 save && pm2 startup`.
  Windows: put a shortcut to a `.bat` with `cd /d C:\path\to\5sigbn-ums` and `npm run serve` in the Startup folder (`shell:startup`).
- Give the server a **fixed IP** in the router (DHCP reservation) so the address never changes.

**Backups** — *Administration → Import / Export → Full backup* (Excel), weekly, plus a database dump:
`docker exec supabase-db pg_dump -U postgres postgres > ums_$(date +%F).sql`

---

## Option B — Online, free (Supabase cloud + free static hosting)

Use this if people must reach it from anywhere (home, on leave, phones on mobile data).

### B1. Database: Supabase free plan
Follow **SETUP.md steps 1–4** (create project, run `schema.sql`, first admin, deploy `manage-users`).
Free plan limits (enough for a battalion): 500 MB database, 1 GB photo storage, 50,000 monthly users.
Note: a free project **pauses after 7 days with no use** — daily use keeps it awake; if it pauses,
press *Restore* in the Supabase dashboard.

### B2. Web app: pick one free host
Build first: `npm run build` (creates `out/`).

| Host | Steps | Address you get |
|---|---|---|
| **Firebase Hosting** (already configured) | `npm i -g firebase-tools` → `firebase login` → `firebase use YOUR_PROJECT` → `firebase deploy --only hosting` | `https://your-project.web.app` |
| **Cloudflare Pages** (unlimited traffic) | dash.cloudflare.com → Workers & Pages → Create → Pages → **Upload assets** → drag the `out` folder | `https://5sigbn-ums.pages.dev` |
| **Netlify** | app.netlify.com → Add new site → **Deploy manually** → drag the `out` folder | `https://5sigbn-ums.netlify.app` |

After the first deploy, set Supabase → **Authentication → URL Configuration → Site URL** to that address.
For each new version: `npm run build` and upload `out/` again (or `firebase deploy`).

---

## Option C — Both
Keep the database on Supabase cloud (B1) and serve the pages on the LAN with `npm run lan`
(A3 with the cloud URL/key in `.env.local`). Pages load fast inside the unit; data is shared with
anyone using the online address.

---

### Quick comparison
| | A: LAN server | B: Online free |
|---|---|---|
| Cost | Free (your hardware) | Free |
| Reach | Unit LAN / Wi-Fi only | Anywhere |
| Internet needed | No (after setup) | Yes |
| Data stays in unit | **Yes** | No (Supabase cloud, Singapore) |
| Maintenance | You keep the server on and backed up | Almost none |
