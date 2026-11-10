import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  getIssuedHolders,
  getSummaryStatus,
  localDate,
  nextInventoryNo,
  sumAllocations,
} from "@/lib/inventory";
import { HttpError } from "@/lib/http";
import {
  CONDITIONS,
  STATUSES,
  TRANSACTION_TYPES,
  type Allocation,
  type Condition,
  type DashboardData,
  type DashboardTransaction,
  type IssuedRow,
  type Item,
  type Status,
  type Transaction,
  type TransactionType,
} from "@/lib/types";
import type { ItemInput, MovementInput } from "@/lib/validation";

export type InventoryItem = Item;

const DB_FILE =
  process.env.INVENTORY_DB_PATH || path.join(process.cwd(), "data", "inventory.db");

type Row = Record<string, unknown>;

// Keep one connection per process (also across dev hot reloads).
const globalForDb = globalThis as unknown as { inventoryDb?: Database.Database };

function now() {
  return new Date().toISOString();
}

function today() {
  return localDate();
}

export function makeId() {
  return globalThis.crypto.randomUUID();
}

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

function toCondition(value: unknown): Condition {
  if (value === "Serviceable") return "Repairable"; // legacy value
  return pick(CONDITIONS, value, "Good");
}

function columnExists(db: Database.Database, table: string, column: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      inventory_no TEXT UNIQUE NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      available_qty INTEGER NOT NULL,
      issued_qty INTEGER NOT NULL,
      issued_to TEXT,
      issue_date TEXT,
      buy_date TEXT,
      voucher_no TEXT,
      voucher_url TEXT,
      product_photo_url TEXT,
      location TEXT,
      cost REAL,
      condition TEXT NOT NULL,
      status TEXT NOT NULL,
      remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      issued_to TEXT,
      voucher_no TEXT,
      voucher_url TEXT,
      remarks TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_allocations (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      holder TEXT,
      location TEXT,
      voucher_no TEXT,
      remarks TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_items_item_name
      ON inventory_items(item_name);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_created_at
      ON inventory_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id
      ON inventory_transactions(item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at
      ON inventory_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_inventory_allocations_item_id
      ON inventory_allocations(item_id);
  `);

  // inventory_no is already UNIQUE, so this older extra index is redundant.
  db.exec(`DROP INDEX IF EXISTS idx_inventory_items_inventory_no`);

  if (!columnExists(db, "inventory_items", "notesheet_url")) {
    db.exec(`ALTER TABLE inventory_items ADD COLUMN notesheet_url TEXT DEFAULT ''`);
  }

  backfillAllocations(db);
}

// Older records may have no accountability rows. Create them once from the
// stored quantities instead of re-checking on every page load.
function backfillAllocations(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT * FROM inventory_items i
       WHERE NOT EXISTS (SELECT 1 FROM inventory_allocations a WHERE a.item_id = i.id)`
    )
    .all() as Row[];

  if (rows.length === 0) return;

  const insert = db.prepare(INSERT_ALLOCATION);

  db.transaction(() => {
    for (const row of rows) {
      const id = String(row.id);
      const available = Number(row.available_qty || 0);
      const issued = Number(row.issued_qty || 0);
      const quantity = Number(row.quantity || 0);
      const location = String(row.location || "");
      const base = { itemId: id, voucherNo: "", createdAt: now() };
      const list: Allocation[] = [];

      if (available > 0) {
        list.push({
          ...base,
          id: makeId(),
          type: "In Store",
          qty: available,
          holder: "QM Store",
          location: location || "QM Store",
          voucherNo: String(row.voucher_no || ""),
          remarks: "Auto-created store balance",
          date: String(row.buy_date || today()),
        });
      }

      if (issued > 0) {
        list.push({
          ...base,
          id: makeId(),
          type: "Issued",
          qty: issued,
          holder: String(row.issued_to || "Issued Holder"),
          location,
          remarks: "Auto-created issued balance",
          date: String(row.issue_date || today()),
        });
      }

      if (list.length === 0 && quantity > 0) {
        const status = pick(STATUSES, row.status, "In Store");
        list.push({
          ...base,
          id: makeId(),
          type: status,
          qty: quantity,
          holder: status === "In Store" ? "QM Store" : String(row.issued_to || status),
          location,
          remarks: "Auto-created balance",
          date: String(row.buy_date || today()),
        });
      }

      for (const allocation of list) insert.run(allocationParams(allocation));
    }
  })();
}

function getDb() {
  if (globalForDb.inventoryDb) return globalForDb.inventoryDb;

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  migrate(db);

  globalForDb.inventoryDb = db;
  return db;
}

/* ---------- row mapping ---------- */

function rowToTransaction(row: Row): Transaction {
  return {
    id: String(row.id),
    type: pick<TransactionType>(TRANSACTION_TYPES, row.type, "Purchase"),
    qty: Number(row.qty || 0),
    issuedTo: String(row.issued_to || ""),
    voucherNo: String(row.voucher_no || ""),
    voucherUrl: String(row.voucher_url || ""),
    remarks: String(row.remarks || ""),
    date: String(row.date || ""),
    createdAt: String(row.created_at || ""),
  };
}

function rowToAllocation(row: Row): Allocation {
  return {
    id: String(row.id),
    itemId: String(row.item_id || ""),
    type: pick<Status>(STATUSES, row.type, "In Store"),
    qty: Number(row.qty || 0),
    holder: String(row.holder || ""),
    location: String(row.location || ""),
    voucherNo: String(row.voucher_no || ""),
    remarks: String(row.remarks || ""),
    date: String(row.date || ""),
    createdAt: String(row.created_at || ""),
  };
}

function rowToItem(row: Row, transactions: Transaction[], allocations: Allocation[]): Item {
  return {
    id: String(row.id),
    inventoryNo: String(row.inventory_no || ""),
    itemName: String(row.item_name || ""),
    category: String(row.category || "Other"),
    quantity: Number(row.quantity || 0),
    availableQty: sumAllocations(allocations, "In Store"),
    issuedQty: sumAllocations(allocations, "Issued"),
    // Who actually holds it now (the stored column could be stale in old records).
    issuedTo: getIssuedHolders(allocations)
      .map((h) => h.holder)
      .join(", "),
    issueDate: String(row.issue_date || ""),
    buyDate: String(row.buy_date || ""),
    voucherNo: String(row.voucher_no || ""),
    voucherUrl: String(row.voucher_url || ""),
    notesheetUrl: String(row.notesheet_url || ""),
    productPhotoUrl: String(row.product_photo_url || ""),
    location: String(row.location || ""),
    cost: Number(row.cost || 0),
    condition: toCondition(row.condition),
    status: getSummaryStatus(allocations),
    remarks: String(row.remarks || ""),
    allocations,
    transactions,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function groupBy<T>(rows: Row[], map: (row: Row) => T) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = String(row.item_id);
    const list = groups.get(key);
    if (list) list.push(map(row));
    else groups.set(key, [map(row)]);
  }

  return groups;
}

/* ---------- writes ---------- */

const INSERT_ALLOCATION = `
  INSERT INTO inventory_allocations
    (id, item_id, type, qty, holder, location, voucher_no, remarks, date, created_at)
  VALUES
    (@id, @itemId, @type, @qty, @holder, @location, @voucherNo, @remarks, @date, @createdAt)
`;

function allocationParams(a: Allocation) {
  return {
    id: a.id,
    itemId: a.itemId,
    type: a.type,
    qty: a.qty,
    holder: a.holder || "",
    location: a.location || "",
    voucherNo: a.voucherNo || "",
    remarks: a.remarks || "",
    date: a.date,
    createdAt: a.createdAt,
  };
}

function insertTransaction(db: Database.Database, itemId: string, txn: Transaction) {
  db.prepare(
    `INSERT INTO inventory_transactions
       (id, item_id, type, qty, issued_to, voucher_no, voucher_url, remarks, date, created_at)
     VALUES
       (@id, @itemId, @type, @qty, @issuedTo, @voucherNo, @voucherUrl, @remarks, @date, @createdAt)`
  ).run({
    id: txn.id,
    itemId,
    type: txn.type,
    qty: txn.qty,
    issuedTo: txn.issuedTo || "",
    voucherNo: txn.voucherNo || "",
    voucherUrl: txn.voucherUrl || "",
    remarks: txn.remarks || "",
    date: txn.date,
    createdAt: txn.createdAt,
  });
}

// Replace one item's accountability rows and refresh its summary columns.
function saveAllocations(
  db: Database.Database,
  itemId: string,
  allocations: Allocation[],
  extra: { issuedTo?: string; issueDate?: string; condition?: Condition } = {}
) {
  db.prepare(`DELETE FROM inventory_allocations WHERE item_id = ?`).run(itemId);

  const insert = db.prepare(INSERT_ALLOCATION);
  for (const allocation of allocations) {
    if (allocation.qty > 0) insert.run(allocationParams({ ...allocation, itemId }));
  }

  db.prepare(
    `UPDATE inventory_items SET
       available_qty = @availableQty,
       issued_qty = @issuedQty,
       status = @status,
       issued_to = COALESCE(@issuedTo, issued_to),
       issue_date = COALESCE(@issueDate, issue_date),
       condition = COALESCE(@condition, condition),
       updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id: itemId,
    availableQty: sumAllocations(allocations, "In Store"),
    issuedQty: sumAllocations(allocations, "Issued"),
    status: getSummaryStatus(allocations),
    issuedTo: extra.issuedTo ?? null,
    issueDate: extra.issueDate ?? null,
    condition: extra.condition ?? null,
    updatedAt: now(),
  });
}

function assertUniqueInventoryNo(db: Database.Database, inventoryNo: string, exceptId = "") {
  const clash = db
    .prepare(`SELECT 1 FROM inventory_items WHERE inventory_no = ? COLLATE NOCASE AND id <> ?`)
    .get(inventoryNo, exceptId);

  if (clash) throw new HttpError("This inventory number already exists.", 409);
}

/* ---------- reads ---------- */

export function readItems(): Item[] {
  const db = getDb();

  const itemRows = db
    .prepare(`SELECT * FROM inventory_items ORDER BY created_at DESC`)
    .all() as Row[];
  const txns = groupBy(
    db.prepare(`SELECT * FROM inventory_transactions ORDER BY created_at DESC`).all() as Row[],
    rowToTransaction
  );
  const allocations = groupBy(
    db.prepare(`SELECT * FROM inventory_allocations ORDER BY created_at ASC`).all() as Row[],
    rowToAllocation
  );

  return itemRows.map((row) =>
    rowToItem(row, txns.get(String(row.id)) || [], allocations.get(String(row.id)) || [])
  );
}

export function getItem(id: string): Item | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(id) as Row | undefined;
  if (!row) return null;

  const txns = db
    .prepare(`SELECT * FROM inventory_transactions WHERE item_id = ? ORDER BY created_at DESC`)
    .all(id) as Row[];
  const allocations = db
    .prepare(`SELECT * FROM inventory_allocations WHERE item_id = ? ORDER BY created_at ASC`)
    .all(id) as Row[];

  return rowToItem(row, txns.map(rowToTransaction), allocations.map(rowToAllocation));
}

function requireItem(id: string) {
  const item = getItem(id);
  if (!item) throw new HttpError("Item not found.", 404);
  return item;
}

export function getNextInventoryNo() {
  const rows = getDb().prepare(`SELECT inventory_no FROM inventory_items`).all() as {
    inventory_no: string;
  }[];

  return nextInventoryNo(rows.map((r) => r.inventory_no));
}

export function getDashboard(): DashboardData {
  const db = getDb();

  const totals = db
    .prepare(`SELECT COUNT(*) AS lines, COALESCE(SUM(quantity), 0) AS total FROM inventory_items`)
    .get() as { lines: number; total: number };

  const byType = db
    .prepare(`SELECT type, COALESCE(SUM(qty), 0) AS qty FROM inventory_allocations GROUP BY type`)
    .all() as { type: string; qty: number }[];

  const qty = (type: Status) => byType.find((r) => r.type === type)?.qty || 0;

  const recent = (
    db
      .prepare(
        `SELECT t.*, i.item_name, i.inventory_no, i.category
         FROM inventory_transactions t
         JOIN inventory_items i ON i.id = t.item_id
         ORDER BY t.created_at DESC
         LIMIT 10`
      )
      .all() as Row[]
  ).map(
    (row): DashboardTransaction => ({
      ...rowToTransaction(row),
      itemId: String(row.item_id),
      itemName: String(row.item_name || ""),
      inventoryNo: String(row.inventory_no || ""),
      category: String(row.category || ""),
    })
  );

  // Who currently holds what, one line per holder and item.
  const issued = db
    .prepare(
      `SELECT a.holder AS holder, i.id AS itemId, i.item_name AS itemName,
              i.inventory_no AS inventoryNo, SUM(a.qty) AS qty, MIN(a.date) AS since
       FROM inventory_allocations a
       JOIN inventory_items i ON i.id = a.item_id
       WHERE a.type = 'Issued'
       GROUP BY a.holder, i.id
       ORDER BY a.holder COLLATE NOCASE, i.item_name COLLATE NOCASE`
    )
    .all() as IssuedRow[];

  return {
    issued,
    stats: {
      lines: totals.lines,
      total: totals.total,
      store: qty("In Store"),
      issued: qty("Issued"),
      repair: qty("Repair"),
      damaged: qty("Damaged"),
    },
    recent,
  };
}

/* ---------- item CRUD ---------- */

export function createItem(input: ItemInput): Item {
  const db = getDb();

  if (input.status === "Issued" && !input.issuedTo) {
    throw new HttpError("Issued To is required when status is Issued.");
  }

  const id = db.transaction(() => {
    // Generated inside the transaction so two people saving at once
    // can never get the same number.
    const inventoryNo = getNextInventoryNo();
    assertUniqueInventoryNo(db, inventoryNo);

    const itemId = makeId();
    const createdAt = now();
    const status = input.status;
    const holder =
      status === "Issued"
        ? input.issuedTo
        : status === "In Store"
          ? "QM Store"
          : `${status} Store`;

    const allocation: Allocation = {
      id: makeId(),
      itemId,
      type: status,
      qty: input.quantity,
      holder,
      location: input.location,
      voucherNo: input.voucherNo,
      remarks: "Initial accountability entry",
      date: status === "Issued" && input.issueDate ? input.issueDate : input.buyDate,
      createdAt,
    };

    db.prepare(
      `INSERT INTO inventory_items (
         id, inventory_no, item_name, category, quantity, available_qty, issued_qty,
         issued_to, issue_date, buy_date, voucher_no, voucher_url, notesheet_url,
         product_photo_url, location, cost, condition, status, remarks, created_at, updated_at
       ) VALUES (
         @id, @inventoryNo, @itemName, @category, @quantity, 0, 0,
         @issuedTo, @issueDate, @buyDate, @voucherNo, @voucherUrl, @notesheetUrl,
         @productPhotoUrl, @location, @cost, @condition, @status, @remarks, @createdAt, @createdAt
       )`
    ).run({
      ...input,
      id: itemId,
      inventoryNo,
      issuedTo: status === "Issued" ? input.issuedTo : "",
      issueDate: status === "Issued" ? input.issueDate : "",
      createdAt,
    });

    insertTransaction(db, itemId, {
      id: makeId(),
      type: "Purchase",
      qty: input.quantity,
      voucherNo: input.voucherNo,
      voucherUrl: input.voucherUrl,
      remarks: "Initial purchase entry",
      date: input.buyDate,
      createdAt,
    });

    saveAllocations(db, itemId, [allocation]);

    return itemId;
  })();

  return requireItem(id);
}

export function updateItem(id: string, input: ItemInput): Item {
  const db = getDb();

  db.transaction(() => {
    const old = requireItem(id);
    const difference = input.quantity - old.quantity;
    let allocations = old.allocations.map((a) => ({ ...a }));

    if (difference > 0) {
      allocations.push({
        id: makeId(),
        itemId: id,
        type: "In Store",
        qty: difference,
        holder: "QM Store",
        location: input.location || old.location || "QM Store",
        voucherNo: input.voucherNo,
        remarks: "Quantity increased during edit",
        date: today(),
        createdAt: now(),
      });
    }

    if (difference < 0) {
      const reduced = takeFrom(allocations, "In Store", -difference);

      if (!reduced) {
        throw new HttpError(
          "Cannot reduce quantity: not enough of this item is In Store. Return issued items first."
        );
      }

      allocations = reduced;
    }

    db.prepare(
      `UPDATE inventory_items SET
         item_name = @itemName, category = @category, quantity = @quantity,
         buy_date = @buyDate, voucher_no = @voucherNo, voucher_url = @voucherUrl,
         notesheet_url = @notesheetUrl, product_photo_url = @productPhotoUrl,
         location = @location, cost = @cost, condition = @condition, remarks = @remarks
       WHERE id = @id`
    ).run({
      ...input,
      id,
      notesheetUrl: input.notesheetUrl || old.notesheetUrl,
      productPhotoUrl: input.productPhotoUrl || old.productPhotoUrl,
    });

    saveAllocations(db, id, allocations);
  })();

  return requireItem(id);
}

export function deleteItem(id: string) {
  const result = getDb().prepare(`DELETE FROM inventory_items WHERE id = ?`).run(id);
  return result.changes > 0;
}

/* ---------- movements (issue / return / repair / damaged) ---------- */

// Removes `qty` from allocations of `type` (optionally one holder).
// Returns null if there is not enough.
function takeFrom(allocations: Allocation[], type: Status, qty: number, holder?: string) {
  if (sumAllocations(allocations, type, holder) < qty) return null;

  let remaining = qty;

  return allocations
    .map((a) => {
      if (remaining <= 0 || a.type !== type || (holder && a.holder !== holder)) return a;

      const deduct = Math.min(a.qty, remaining);
      remaining -= deduct;
      return { ...a, qty: a.qty - deduct };
    })
    .filter((a) => a.qty > 0);
}

function addTo(
  allocations: Allocation[],
  entry: Omit<Allocation, "id" | "createdAt">
): Allocation[] {
  const existing = allocations.find(
    (a) =>
      a.type === entry.type &&
      a.holder === entry.holder &&
      a.location === entry.location &&
      a.voucherNo === entry.voucherNo
  );

  if (existing) {
    return allocations.map((a) =>
      a === existing
        ? { ...a, qty: a.qty + entry.qty, remarks: entry.remarks || a.remarks, date: entry.date }
        : a
    );
  }

  return [...allocations, { ...entry, id: makeId(), createdAt: now() }];
}

const MOVES: Record<
  MovementInput["type"],
  { from: Status; to: Status; holder: string; location: string; label: string }
> = {
  Issue: { from: "In Store", to: "Issued", holder: "", location: "", label: "Issue" },
  Return: { from: "Issued", to: "In Store", holder: "QM Store", location: "", label: "Return" },
  Repair: { from: "In Store", to: "Repair", holder: "Repair Store", location: "Repair Store", label: "Repair" },
  Repaired: { from: "Repair", to: "In Store", holder: "QM Store", location: "", label: "Back from repair" },
  Damaged: { from: "In Store", to: "Damaged", holder: "Damaged Store", location: "Damaged Store", label: "Damaged" },
};

export function applyMovement(id: string, input: MovementInput): Item {
  const db = getDb();

  db.transaction(() => {
    const item = requireItem(id);
    const move = MOVES[input.type];

    // Return can target one holder; everything else draws from the pool.
    const fromHolder = input.type === "Return" && input.holder ? input.holder : undefined;
    const reduced = takeFrom(item.allocations, move.from, input.qty, fromHolder);

    if (!reduced) {
      const available = sumAllocations(item.allocations, move.from, fromHolder);
      throw new HttpError(
        `${move.label} quantity cannot exceed ${move.from} quantity (${available} available${
          fromHolder ? ` with ${fromHolder}` : ""
        }).`
      );
    }

    const toStore = move.to === "In Store";
    const allocations = addTo(reduced, {
      itemId: id,
      type: move.to,
      qty: input.qty,
      holder: input.type === "Issue" ? input.holder : move.holder,
      location: move.location || (toStore ? item.location || "QM Store" : item.location),
      voucherNo: input.voucherNo,
      remarks:
        input.remarks ||
        (input.type === "Return" && input.holder ? `Returned from ${input.holder}` : ""),
      date: input.date,
    });

    insertTransaction(db, id, {
      id: makeId(),
      type: input.type,
      qty: input.qty,
      issuedTo: input.holder,
      voucherNo: input.voucherNo,
      voucherUrl: "",
      remarks: input.remarks,
      date: input.date,
      createdAt: now(),
    });

    let condition: Condition | undefined;
    if (input.type === "Repair") condition = "Repairable";
    if (input.type === "Damaged") condition = "Poor";
    if (
      input.type === "Repaired" &&
      item.condition === "Repairable" &&
      sumAllocations(allocations, "Repair") === 0
    ) {
      condition = "Good";
    }

    // Keep the summary "Issued To" column in step with who actually holds it.
    const holders = getIssuedHolders(allocations).map((h) => h.holder);

    saveAllocations(db, id, allocations, {
      issuedTo: holders.join(", "),
      issueDate: input.type === "Issue" ? input.date : undefined,
      condition,
    });
  })();

  return requireItem(id);
}
