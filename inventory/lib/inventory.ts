// Inventory rules shared by the server and the browser.
import type { Allocation, Item, MovementType, Status } from "@/lib/types";

export const INVENTORY_PREFIX = "INV-5SIG";

export function sumAllocations(
  allocations: Allocation[] = [],
  type: Status,
  holder?: string
) {
  let total = 0;

  for (const allocation of allocations) {
    if (allocation.type !== type) continue;
    if (holder && allocation.holder !== holder) continue;
    total += Number(allocation.qty || 0);
  }

  return total;
}

export type Breakdown = Record<Status, number>;

export function getBreakdown(allocations: Allocation[] = []): Breakdown {
  return {
    "In Store": sumAllocations(allocations, "In Store"),
    Issued: sumAllocations(allocations, "Issued"),
    Repair: sumAllocations(allocations, "Repair"),
    Damaged: sumAllocations(allocations, "Damaged"),
  };
}

export function getSummaryStatus(allocations: Allocation[]): Status {
  const b = getBreakdown(allocations);

  if (b.Damaged > 0 && b["In Store"] === 0 && b.Issued === 0 && b.Repair === 0) {
    return "Damaged";
  }
  if (b.Repair > 0 && b["In Store"] === 0 && b.Issued === 0) return "Repair";
  if (b.Issued > 0 && b["In Store"] === 0 && b.Repair === 0 && b.Damaged === 0) {
    return "Issued";
  }
  return "In Store";
}

// Issued quantities grouped by holder, for the "Returned From" list.
export function getIssuedHolders(allocations: Allocation[] = []) {
  const holders = new Map<string, number>();

  for (const allocation of allocations) {
    if (allocation.type !== "Issued") continue;
    holders.set(allocation.holder, (holders.get(allocation.holder) || 0) + allocation.qty);
  }

  return [...holders.entries()].map(([holder, qty]) => ({ holder, qty }));
}

// Next number in the INV-5SIG-YYYY-NNNN series (numbering continues across years).
export function nextInventoryNo(existing: string[], year = new Date().getFullYear()) {
  let max = 0;
  const pattern = new RegExp(`^${INVENTORY_PREFIX}-\\d{4}-(\\d+)$`, "i");

  for (const value of existing) {
    const match = value.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }

  return `${INVENTORY_PREFIX}-${year}-${String(max + 1).padStart(4, "0")}`;
}

// Pre-built lowercase text used by the register search box.
export function searchText(item: Item) {
  return [
    item.inventoryNo,
    item.itemName,
    item.category,
    item.location,
    item.issuedTo,
    item.voucherNo,
    item.condition,
    item.status,
    item.remarks,
    ...item.allocations.map(
      (a) => `${a.type} ${a.holder} ${a.location} ${a.voucherNo} ${a.remarks}`
    ),
  ]
    .join(" ")
    .toLowerCase();
}

// Where each movement takes stock from.
export const MOVE_FROM: Record<MovementType, Status> = {
  Issue: "In Store",
  Return: "Issued",
  Repair: "In Store",
  Repaired: "Repair",
  Damaged: "In Store",
};

export const MOVE_ORDER: MovementType[] = ["Issue", "Return", "Repair", "Repaired", "Damaged"];

// Today's date as YYYY-MM-DD in local time. (toISOString() is UTC, which is
// still "yesterday" in Bangladesh between midnight and 6 AM.)
export function localDate(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function badgeClass(value: string) {
  return `badge ${value.replaceAll(" ", "-").toLowerCase()}`;
}

export function isImageFile(url: string) {
  return /\.(jpe?g|png|webp)$/i.test(url);
}
