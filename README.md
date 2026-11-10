# 5 Signal Battalion — Unit Systems

One package, one start button, one address for everyone on the LAN.

The portal shows **daily activities pictures** (scrolling) and one tile per module:

| Tile | Opens | System |
|---|---|---|
| Soldiers' Database | personal files, vehicles, sick report, import / export | UMS |
| Parade State & Leave | daily parade state (with History & Reports), leave, leave due | UMS |
| Training | training state, record results, cycle plan, calendar, courses, photos | UMS |
| Officers' Desk | Officers' Daily Commitments, Officers' Tasks | UMS |
| Daily Activities | daily commitments (programme), duty roster, notices | UMS |
| Unit Inventory | register, issue / return, vouchers | UIMS |

The five UMS tiles are **one system with one login**: sign in once and every UMS tile opens
directly. Inside, each module shows only its own pages; the **Module** button at the top of the
menu switches module. *Administration* (users, settings, audit) is in that switcher.
Each person sees only the modules and pages of his role, as before. Press **1**–**6** on the portal to open a tile.

| System | Port | Folder |
|---|---|---|
| **Portal** — the page everyone opens | **8080** | `portal\` |
| Unit Management System (UMS) | 8081 | `ums\` |
| Unit Inventory Management System (UIMS) | 8082 | `inventory\` |

Both systems have an **All systems** button (login page and top bar) that goes back to the portal.

## Folder layout

```
5sigbn-unit-systems\
├─ START-ALL.bat           ← double-click to start everything
├─ REBUILD-ALL.bat         ← use after copying in a new version of either system
├─ BACKUP-INVENTORY.bat    ← safe copy of the inventory database + uploads
├─ portal\                 ← the launcher page (config.js = names, ports, colours, logos)
├─ ums\                    ← Unit Management System (Next.js, built to ums\out)
├─ inventory\              ← Unit Inventory Management System (Next.js + SQLite)
│   ├─ data\inventory.db   ← inventory database (keep -wal / -shm files with it)
│   ├─ public\uploads\     ← vouchers, notesheets, photos
│   └─ .env.local          ← inventory login (created on first start)
└─ Inventory_Backup\       ← backups land here (one dated folder per backup)
```

Keep the folder somewhere permanent, e.g. `D:\UNIT-SYSTEMS\5sigbn-unit-systems`.
Do not move `ums`, `inventory` or `portal` out of it — the portal finds them by these names.

## First start (server PC)

1. Install **Node.js 20 LTS or newer** (nodejs.org, or from a USB).
2. Double-click **START-ALL.bat**.
   The first time it installs packages for both systems (`npm ci`) and builds them.
   **This one time needs internet** (about 5–10 minutes). After that everything runs offline.
   *No internet on the server?* Do the first start on any PC with internet, then copy the whole
   folder (with the new `node_modules` folders inside `ums` and `inventory`) to the server.
3. The window prints the address to give everyone, e.g. `http://192.168.1.10:8080`.
   **Keep this window open** — closing it stops all systems.

### Inventory login

On the first start `inventory\.env.local` is created with:

```
INVENTORY_USERNAME=admin
INVENTORY_PASSWORD=change-me-to-a-strong-password
```

Open it in Notepad, set your own username and password, save, close the black window and
start again. (Changing the password logs everyone out of the inventory.)

UMS logins are unchanged (Personal No + password; demo mode if Supabase is not configured).
The UMS and the inventory keep **separate logins and separate data** (one login covers all five UMS tiles).

## Everyday use

| Task | What to do |
|---|---|
| Start | **START-ALL.bat** |
| Stop | Press **Ctrl+C** in the window, or close it |
| After copying in a new version | just **START-ALL.bat** — it sees the new program files and builds again by itself (a few minutes). REBUILD-ALL.bat forces a rebuild. |
| Inventory backup | **BACKUP-INVENTORY.bat** → `Inventory_Backup\<date_time>\` (safe while running) |
| Restore inventory | Stop, copy the backup's `inventory.db` to `inventory\data\` (delete `inventory.db-wal` / `-shm` there), copy its `uploads` to `inventory\public\uploads` |

**Start automatically after a power cut:** `Win+R` → `shell:startup` → put a shortcut to
`START-ALL.bat` in that folder. Also set the PC not to sleep.

**Firewall:** the first time Windows asks, allow Node.js on *Private networks*.
Other PCs need ports 8080, 8081 and 8082 open.

**Installing an update zip:** the update zip does **not** contain any inventory data (no `inventory\data`,
no uploads, no backups), so you can extract it over your folder: your items, photos, password and backups stay.
Then start with START-ALL — it rebuilds what changed by itself.

**Updating one system:** replace its folder's code but keep `inventory\data`,
`inventory\public\uploads` and `inventory\.env.local`. Then start with **START-ALL.bat**.

## Who sees which module (v3.4)

| Login | Modules | Data |
|---|---|---|
| Admin, CO, 2IC, Adjt | all six | whole battalion |
| Coy Comd | all six (approves his coy's leave) | his coy |
| Coy Rep | Soldiers' Database, Parade State & Leave, Training, Daily Activities (gives the parade state) | his coy |
| Bn Rep | Soldiers' Database, Parade State & Leave, Training, Daily Activities (gives the parade state) | all coys |
| Clerk | Soldiers' Database, Training, Daily Activities — enters daily commitments, training calendar and notices on behalf of officers | all coys |
| Individual | his file, leave, My Training, Daily Activities — applies for leave, requests changes to his information | himself |

Officers' Desk is also open to an individual officer (his own commitments and tasks).

## Daily activities pictures

Copy photos into **`portal\activities`** — no restart needed, refresh the portal.
Name each file with the date and what it shows, e.g. `2026-10-25 Annual Firing.jpg`:
the words become the caption, the date is shown under it, newest first (up to 40).
Click a picture to see it large (← → to move, Esc to close).
Delete the `sample-…svg` pictures once you have your own. Photos sent through WhatsApp are a
good size; very large camera photos (5 MB +) are slow on phones.

## Changing names, ports, colours or logos

Edit `portal\config.js` and refresh the page — nothing to build.

## Troubleshooting

- **"Smart App Control blocked a file that may be unsafe"** when opening a .bat — Windows blocks
  .bat files that came from the internet. Fix once: open the folder, type `cmd` in the address bar,
  press Enter, and run
  `powershell -NoProfile -Command "Get-ChildItem -Recurse | Unblock-File"`.
  After that the .bat files open normally. (Or start directly with `node portal\serve.mjs` in that window.)
  Next time: right-click the .zip → Properties → tick **Unblock** → OK, *then* extract.

- **"port 8080 already in use"** — START-ALL is already running in another window; close it.
- **A tile shows "Updating…"** — that system is being installed / built after an update; wait a few minutes.
- **A tile shows a red dot "Offline"** — that system did not start; read the lines marked `✗` in the window.
- **"npm ci failed"** on the first start — no internet; see step 2 above.
- **Inventory page says login failed** — check `inventory\.env.local` (no spaces around `=`).

---
For official use only · © BA 11108 Capt Asif Mahmud, Sigs
