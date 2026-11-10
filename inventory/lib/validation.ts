import { HttpError } from "@/lib/http";
import { localDate } from "@/lib/inventory";
import {
  CONDITIONS,
  STATUSES,
  type Condition,
  type MovementType,
  type Status,
} from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Only files this app uploaded may be linked (blocks javascript: and outside links).
const UPLOAD_URL_RE = /^\/uploads\/[\w.-]+$/;

function text(body: Record<string, unknown>, key: string, label: string, max = 200) {
  const value = String(body[key] ?? "").trim();
  if (value.length > max) throw new HttpError(`${label} is too long (max ${max} characters).`);
  return value;
}

function required(body: Record<string, unknown>, key: string, label: string, max = 200) {
  const value = text(body, key, label, max);
  if (!value) throw new HttpError(`${label} is required.`);
  return value;
}

function date(body: Record<string, unknown>, key: string, label: string, isRequired: boolean) {
  const value = isRequired ? required(body, key, label) : text(body, key, label);
  if (value && (!DATE_RE.test(value) || Number.isNaN(Date.parse(value)))) {
    throw new HttpError(`${label} must be a valid date.`);
  }
  return value;
}

function fileUrl(body: Record<string, unknown>, key: string, label: string) {
  const value = text(body, key, label, 300);
  if (value && !UPLOAD_URL_RE.test(value)) throw new HttpError(`${label} is not a valid file.`);
  return value;
}

function quantity(value: unknown, label = "Quantity") {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new HttpError(`${label} must be a whole number of at least 1.`);
  }
  if (qty > 1_000_000) throw new HttpError(`${label} is too large.`);
  return qty;
}

export type ItemInput = {
  itemName: string;
  category: string;
  quantity: number;
  buyDate: string;
  cost: number;
  voucherNo: string;
  voucherUrl: string;
  notesheetUrl: string;
  productPhotoUrl: string;
  location: string;
  condition: Condition;
  status: Status;
  issuedTo: string;
  issueDate: string;
  remarks: string;
};

export function parseItemInput(body: Record<string, unknown>): ItemInput {
  const cost = Number(body.cost);
  if (body.cost === "" || body.cost == null || !Number.isFinite(cost) || cost < 0) {
    throw new HttpError("Valid cost is required.");
  }

  const condition = String(body.condition || "");
  if (!CONDITIONS.includes(condition as Condition)) throw new HttpError("Condition is required.");

  const status = String(body.status || "In Store");
  if (!STATUSES.includes(status as Status)) throw new HttpError("Status is not valid.");

  const input: ItemInput = {
    itemName: required(body, "itemName", "Item Name"),
    category: required(body, "category", "Category", 60),
    quantity: quantity(body.quantity),
    buyDate: date(body, "buyDate", "Buying Date", true),
    cost,
    voucherNo: required(body, "voucherNo", "Voucher No"),
    voucherUrl: fileUrl(body, "voucherUrl", "Voucher File"),
    notesheetUrl: fileUrl(body, "notesheetUrl", "Notesheet"),
    productPhotoUrl: fileUrl(body, "productPhotoUrl", "Product Photo"),
    location: text(body, "location", "Location"),
    condition: condition as Condition,
    status: status as Status,
    issuedTo: text(body, "issuedTo", "Issued To"),
    issueDate: date(body, "issueDate", "Issue Date", false),
    remarks: text(body, "remarks", "Remarks", 2000),
  };

  if (!input.voucherUrl) throw new HttpError("Voucher File is required.");

  return input;
}

export type MovementInput = {
  type: MovementType;
  qty: number;
  holder: string;
  voucherNo: string;
  remarks: string;
  date: string;
};

const MOVEMENT_TYPES: MovementType[] = ["Issue", "Return", "Repair", "Repaired", "Damaged"];

export function parseMovementInput(body: Record<string, unknown>): MovementInput {
  const type = String(body.type || "") as MovementType;
  if (!MOVEMENT_TYPES.includes(type)) throw new HttpError("Unknown transaction type.");

  const input: MovementInput = {
    type,
    qty: quantity(body.qty),
    holder: text(body, "issuedTo", "Issued To"),
    voucherNo: text(body, "voucherNo", "Voucher / Note No"),
    remarks: text(body, "remarks", "Remarks", 2000),
    date: date(body, "date", "Date", false) || localDate(),
  };

  if (type === "Issue" && !input.holder) throw new HttpError("Issued To is required.");

  return input;
}
