# 5 Signal Battalion — Unit Inventory

Unit Property Management System for the unit's private items: register items with
voucher, notesheet and photo, then track every Issue, Return, Repair, Back from
Repair and Damaged movement with a full accountability trail.

Built with Next.js 16, React 19 and SQLite (`better-sqlite3`). Runs on one PC and is
used by others over the local network.

## Look (v3.4)

Same fonts, colours, sidebar, top bar, banner and login page as the Unit Management System, so both
systems feel like one. The credit is in the sidebar footer.

## Running inside the Unit Systems Portal

In the combined package this folder is `inventory\` and is started by **START-ALL.bat**
(one level up) on port **8082** with `npm run start:portal`; the portal page is on 8080.
The *All systems* button in the top bar and on the login page goes back to the portal.
The commands below still work if you run this system on its own.

## First-time setup

Requires [Node.js](https://nodejs.org) 20 or newer.

```bat
cd unit-inventory-system
npm ci
copy .env.example .env.local
```

Open `.env.local` and set your own `INVENTORY_USERNAME` and `INVENTORY_PASSWORD`.
If you skip this, the old default password is used, and that password is visible
to anyone who opens this public GitHub repo.

## Running

| Purpose | Command |
| --- | --- |
| Development (auto-reload) | `npm run dev` |
| Production build | `npm run build` |
| Production, this PC only | `npm start` |
| Production, whole LAN | `npm run start:lan` → others open `http://<this-PC-IP>:3000` |
| Under the portal (port 8082) | `npm run start:portal` |

After pulling new code, run `npm ci` and `npm run build` again before starting.

## Backups

```bat
npm run backup
```

Saves a safe copy of the database and all uploaded files to
`..\Inventory_Backup\<date_time>\`. You can also give a folder:
`npm run backup -- E:\InventoryBackups`. It is safe to run while the app is open.

To restore, stop the app and copy the backup's `inventory.db` to `data\inventory.db`
(delete any `inventory.db-wal` and `inventory.db-shm` next to it). Then copy the
backup's `uploads` folder to `public\uploads`.

## Using it

- **Dashboard** shows totals (click a card to see those items), **Who Holds What**
  (every issued item and its holder), and recent activity.
- **Inventory Register** is where all the work happens. Search or filter, then
  click any row to open the item. From there you can **Issue**, **Return**,
  **Send to Repair**, **Back from Repair**, **Mark Damaged**, **Edit** or **Delete**.
  Use **+ Add Item** to register new property.
- **Printing**: *Print* on the register prints the current (filtered) list on
  A4 landscape with signature lines. Every history line in an item has
  *Print voucher*, which prints an office copy and a holder copy on one A4 sheet.
- **Export CSV** opens in Excel (Bangla text and ৳ included).
- Press **Esc** to close the top dialog.
- **বাংলা / English**: the button in the top bar (and on the login page) switches
  the whole interface, printed vouchers and the register between English and
  Bangla, with Bangla numerals. Each computer remembers its choice. Item names,
  holders and remarks are shown exactly as they were typed.

## Where things are

| Path | What |
| --- | --- |
| `data/inventory.db` | The database (items, accountability, transaction history) |
| `public/uploads/` | Uploaded vouchers, notesheets and photos |
| `app/page.tsx`, `app/inventory/` | Dashboard and Inventory Register pages |
| `app/components/` | Dialogs: item details, add/edit form, issue/return form |
| `app/print/` | Printable vouchers |
| `app/api/` | Server API routes |
| `lib/db.ts` | All database reads and writes |
| `lib/inventory.ts` | Stock rules shared by server and browser |
| `lib/validation.ts` | Checks on everything the server receives |
| `lib/auth.ts`, `proxy.ts` | Login sessions and page/API protection |

## How stock is tracked

Every item's quantity is split into **accountability rows**: In Store (QM Store),
Issued (per holder), Repair and Damaged. Each movement moves quantity between them
and adds a line to the transaction history:

| Movement | From | To |
| --- | --- | --- |
| Issue | In Store | Issued (to a holder) |
| Return | Issued (any or one holder) | In Store |
| Repair | In Store | Repair |
| Back from Repair | Repair | In Store |
| Damaged | In Store | Damaged |

An item's status and "Issued To" come from these rows, so they cannot drift out of
date. To change who holds an item, use a movement in the Inventory Register rather
than editing the item.
