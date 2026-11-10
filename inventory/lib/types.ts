export const STATUSES = ["In Store", "Issued", "Repair", "Damaged"] as const;
export type Status = (typeof STATUSES)[number];

export const CONDITIONS = ["Excellent", "Good", "Repairable", "Poor"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CATEGORIES = [
  "Furniture",
  "Crockery",
  "Electrical",
  "Stationery",
  "Sports",
  "Kitchen",
  "Other",
] as const;

export const TRANSACTION_TYPES = [
  "Purchase",
  "Issue",
  "Return",
  "Repair",
  "Repaired",
  "Damaged",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// Transactions a user can make from the register (Purchase is automatic).
export type MovementType = Exclude<TransactionType, "Purchase">;

export type Allocation = {
  id: string;
  itemId: string;
  type: Status;
  qty: number;
  holder: string;
  location: string;
  voucherNo: string;
  remarks: string;
  date: string;
  createdAt: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  qty: number;
  issuedTo?: string;
  voucherNo?: string;
  voucherUrl?: string;
  remarks?: string;
  date: string;
  createdAt: string;
};

export type Item = {
  id: string;
  inventoryNo: string;
  itemName: string;
  category: string;
  quantity: number;
  availableQty: number;
  issuedQty: number;
  issuedTo: string;
  issueDate: string;
  buyDate: string;
  voucherNo: string;
  voucherUrl: string;
  notesheetUrl: string;
  productPhotoUrl: string;
  location: string;
  cost: number;
  condition: Condition;
  status: Status;
  remarks: string;
  allocations: Allocation[];
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
};

export type DashboardTransaction = Transaction & {
  itemId: string;
  itemName: string;
  inventoryNo: string;
  category: string;
};

export type DashboardData = {
  stats: {
    lines: number;
    total: number;
    store: number;
    issued: number;
    repair: number;
    damaged: number;
  };
  recent: DashboardTransaction[];
  issued: IssuedRow[];
};

export type IssuedRow = {
  holder: string;
  itemId: string;
  itemName: string;
  inventoryNo: string;
  qty: number;
  since: string;
};

export const emptyForm = {
  inventoryNo: "",
  itemName: "",
  category: "Furniture",
  quantity: 1,
  buyDate: "",
  voucherNo: "",
  voucherUrl: "",
  notesheetUrl: "",
  productPhotoUrl: "",
  location: "",
  cost: 0,
  condition: "Good" as Condition,
  status: "In Store" as Status,
  issuedTo: "",
  issueDate: "",
  remarks: "",
};

export type FormState = typeof emptyForm;
