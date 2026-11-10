// Safe backup of the inventory database and uploaded files.
//
//   npm run backup                 -> ../Inventory_Backup/2026-10-25_0930/
//   npm run backup -- D:\Backups   -> D:\Backups\2026-10-25_0930\
//
// Uses SQLite's online backup, so it is safe while the app is running
// (copying inventory.db by hand can miss data still in inventory.db-wal).
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const root = process.cwd();
const dbFile = process.env.INVENTORY_DB_PATH || path.join(root, "data", "inventory.db");
const uploadsDir = path.join(root, "public", "uploads");

const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

const baseDir = process.argv[2] || path.join(root, "..", "Inventory_Backup");
const target = path.join(baseDir, stamp);

if (!fs.existsSync(dbFile)) {
  console.error(`Database not found: ${dbFile}`);
  process.exit(1);
}

fs.mkdirSync(path.join(target, "uploads"), { recursive: true });

const db = new Database(dbFile, { readonly: true, fileMustExist: true });
await db.backup(path.join(target, "inventory.db"));
const count = db.prepare("SELECT COUNT(*) AS n FROM inventory_items").get().n;
db.close();

let files = 0;
if (fs.existsSync(uploadsDir)) {
  for (const name of fs.readdirSync(uploadsDir)) {
    const from = path.join(uploadsDir, name);
    if (fs.statSync(from).isFile()) {
      fs.copyFileSync(from, path.join(target, "uploads", name));
      files++;
    }
  }
}

console.log(`Backup saved to ${target}`);
console.log(`  ${count} items, ${files} uploaded files`);
