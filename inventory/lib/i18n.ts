// English / Bangla interface text.
//
// Every key in `en` must also exist in `bn` (TypeScript enforces it).
// Data typed by users (item names, holders, remarks) is never translated.

export type Lang = "en" | "bn";
export const LANG_COOKIE = "uims_lang";

const en = {
  // App & navigation
  appName: "5 Signal Battalion",
  appSub: "Unit Inventory",
  systemName: "UIMS · Unit Inventory Management System",
  navDashboard: "Dashboard",
  navRegister: "Inventory Register",
  logout: "Logout",
  darkMode: "Switch to dark mode",
  lightMode: "Switch to light mode",
  langButton: "বাংলা",
  allSystems: "All systems",
  langTitle: "বাংলায় দেখুন (Switch to Bangla)",
  footerCopy: "© {year} 5 Signal Battalion · Unit Property Management System",
  footerCourtesy: "Courtesy: BA 11108 Capt Asif Mahmud, Sigs",
  brandSub: "Unit Inventory System",
  storeBanner: "QM Store",
  storeBannerSub: "Unit property register",
  storeChip: "Unit Inventory",
  connectedLocal: "Connected · data on this PC",
  collapseMenu: "Collapse menu",
  expandMenu: "Expand menu",
  eyebrowInv: "Unit Inventory",
  loginEyebrow: "Secure sign in",
  loginWelcome: "Welcome",

  // Common
  cancel: "Cancel",
  close: "Close",
  edit: "Edit",
  delete: "Delete",
  open: "Open",
  loading: "Loading…",
  saving: "Saving…",
  pleaseWait: "Please wait…",
  openNewTab: "Open in new tab",
  optional: "Optional",
  all: "All",
  clear: "Clear",
  print: "Print",
  sessionExpired: "Session expired. Please log in again.",
  requestFailed: "Request failed.",
  somethingWrong: "Something went wrong.",

  // Login
  loginPrompt: "5 Signal Battalion · Please log in",
  username: "Username",
  password: "Password",
  show: "Show",
  hide: "Hide",
  showPassword: "Show password",
  hidePassword: "Hide password",
  login: "Login",
  loggingIn: "Logging in…",
  loginFailed: "Login failed.",
  cannotReach: "Cannot reach the server. Check the network and try again.",
  lanOnly: "Local LAN access only",

  // Dashboard
  dashTitle: "Dashboard",
  dashSub: "Unit property at a glance",
  dashLines: "{n} item lines",
  openRegister: "Open Register",
  addItem: "+ Add Item",
  cardTotal: "Total Items",
  cardStore: "In Store",
  cardIssued: "Issued",
  cardRepair: "In Repair",
  cardDamaged: "Damaged",
  viewItems: "View items →",
  whoHolds: "Who Holds What",
  holdersCount: "{n} holders with issued items",
  holdersHint: "Issued items by holder",
  findHolder: "Find holder or item",
  noMatch: "No match.",
  nothingIssued: "Nothing is issued right now — everything is in store.",
  recentTitle: "Recent Activity",
  recentSub: "Last 10 purchases, issues, returns and repairs",
  noActivity: "No activity yet.",

  // Table columns
  colSer: "Ser",
  colItem: "Item",
  colCategory: "Category",
  colTotal: "Total",
  colInStore: "In Store",
  colIssued: "Issued",
  colRepair: "Repair",
  colDamaged: "Damaged",
  colStatus: "Status",
  colHeldBy: "Held by",
  colHolder: "Holder",
  colQty: "Qty",
  colSince: "Since",
  colDate: "Date",
  colType: "Type",
  colLocation: "Location",
  colVoucherNote: "Voucher / note",
  colRemarks: "Remarks",
  colInvNo: "Inventory No",
  colVoucherNo: "Voucher No",
  colBuyDate: "Buying Date",
  colCost: "Cost",
  colCondition: "Condition",

  // Register
  regTitle: "Inventory Register",
  regSub: "Click any item to see where it is, issue it, take it back, or edit it.",
  searchPh: "Search item, inv no, holder, voucher, location…",
  search: "Search",
  allCategories: "All categories",
  anyStatus: "Any status",
  has_InStore: "Has stock in store",
  has_Issued: "Has issued",
  has_Repair: "Has in repair",
  has_Damaged: "Has damaged",
  exportCsv: "Export CSV",
  noItems: "No items yet.",
  addFirst: "Add the first item",
  noFilterMatch: "Nothing matches these filters.",
  clearFilters: "Clear filters",
  showing: "Showing {shown} of {total} item lines · {pieces} pieces",
  printTitle: "5 Signal Battalion — Unit Inventory Register",
  printed: "Printed {date} · {n} item lines",
  filterCategory: "Category: {v}",
  filterStatus: "Status: {v}",
  filterSearch: "Search: “{v}”",
  sigPrepared: "Prepared by (QM Store)",
  sigChecked: "Checked by",
  sigCounter: "Countersigned (Adjt / OC)",
  deleted: "{no} deleted.",
  added: "{no} added to the register.",
  changesSaved: "Changes saved.",
  deleteTitle: "Delete item?",
  deletePermanently: "Delete permanently",
  deleteMsg: "and its complete history will be removed. This cannot be undone.",
  printVoucher: "Print voucher",
  msg_Issue: "Issued {qty} to {holder}.",
  msg_Return: "{qty} returned to store.",
  msg_ReturnFrom: "{qty} returned to store from {holder}.",
  msg_Repair: "{qty} sent for repair.",
  msg_Repaired: "{qty} back in store from repair.",
  msg_Damaged: "{qty} marked as damaged.",
  csvFile: "inventory-register",

  // Item detail
  dInvNo: "Inventory no",
  dBuyDate: "Buying date",
  dCost: "Cost",
  dVoucherNo: "Voucher no",
  dLocation: "Location",
  dCondition: "Condition",
  dHeldBy: "Held by",
  dNobody: "Nobody (all in store)",
  dRemarks: "Remarks",
  fileProductPhoto: "Product Photo",
  fileVoucher: "Voucher",
  fileNotesheet: "Notesheet",
  whereNow: "Where it is now",
  noStock: "No stock recorded.",
  history: "History",
  noTxns: "No transactions yet.",
  hQty: "Qty {n}",
  hVoucher: "Voucher {v}",
  nothing_InStore: "Nothing in store",
  nothing_Issued: "Nothing issued",
  nothing_Repair: "Nothing in repair",
  nothing_Damaged: "Nothing damaged",

  // Movements (Issue / Return / ...)
  mv_Issue_button: "Issue",
  mv_Issue_title: "Issue Item",
  mv_Issue_note: "Hand over items from the store to a person, office or section.",
  mv_Return_button: "Return",
  mv_Return_title: "Return to Store",
  mv_Return_note: "Take issued items back into the store. Pick the holder, or leave it on any holder.",
  mv_Repair_button: "Send to Repair",
  mv_Repair_title: "Send for Repair",
  mv_Repair_note: "Move items from the store to repair. Bring them back with Back from Repair.",
  mv_Repaired_button: "Back from Repair",
  mv_Repaired_title: "Back from Repair",
  mv_Repaired_note: "Return repaired items to the store.",
  mv_Damaged_button: "Mark Damaged",
  mv_Damaged_title: "Mark as Damaged",
  mv_Damaged_note: "Move unusable items out of the store into the damaged list.",
  confirmMove: "Confirm {action}",
  qtyMax: "Quantity (max {n})",
  date: "Date",
  voucherNoteNo: "Voucher / note no",
  voucherNotePh: "Issue voucher / return note / repair note",
  remarks: "Remarks",
  issuedTo: "Issued to",
  issuedToHint: "Name / rank / office / section",
  issuedToPh: "e.g. Snk Asif / Coy Office",
  returnedFrom: "Returned from",
  anyHolder: "Any holder ({n} issued)",
  holdsN: "{holder} — holds {n}",
  errQty: "Enter a whole quantity of at least 1.",
  errOnly: "Only {n} available.",
  errHolder: "Enter who it is issued to.",

  // Add / edit form
  addNewItem: "Add New Item",
  editItem: "Edit Item",
  willBeSaved: "Will be saved as",
  saveChanges: "Save Changes",
  saveItem: "Save Item",
  secItem: "Item",
  secPurchase: "Purchase",
  secInitial: "Initial status",
  secDocs: "Documents",
  itemName: "Item name",
  itemNamePh: "e.g. Office Table",
  category: "Category",
  quantity: "Quantity",
  qtyEditHint: "Increasing adds to store; decreasing takes from store.",
  condition: "Condition",
  buyDate: "Buying date",
  cost: "Cost (৳)",
  voucherNo: "Voucher no",
  voucherNoPh: "e.g. CRV 112",
  location: "Location",
  locationPh: "e.g. QM Store",
  status: "Status",
  issueDate: "Issue date",
  initialHint: "New items usually start In Store. Issue them later from the register.",
  voucherFile: "Voucher file",
  notesheet: "Notesheet",
  productPhoto: "Product photo",
  photoHint: "Large photos are resized automatically.",
  remarksPh: "Any additional notes",
  newFile: "New file:",
  currentKept: "Current file kept.",
  errItemName: "Enter the item name.",
  errQtyWhole: "Whole number, at least 1.",
  errBuyDate: "Choose the buying date.",
  errCost: "Enter a valid cost (0 or more).",
  errVoucherNo: "Enter the voucher number.",
  errVoucherFile: "Attach the voucher (PDF or photo).",
  errIssuedTo: "Who is it issued to?",

  // Vouchers
  voucherLoading: "Loading voucher…",
  txnGone: "This transaction no longer exists.",
  officeCopy: "Office copy",
  holderCopy: "Holder copy",
  cutHere: "✂ cut here",
  vVoucherNo: "Voucher / Note No",
  vDate: "Date",
  vInvNo: "Inventory No",
  vItem: "Item",
  vCategory: "Category",
  vQty: "Quantity",
  vRemarks: "Remarks",
  vt_Purchase: "Receipt Voucher (Purchase)",
  vt_Issue: "Issue Voucher",
  vt_Return: "Receipt Voucher (Return to Store)",
  vt_Repair: "Repair Voucher",
  vt_Repaired: "Receipt Voucher (Back from Repair)",
  vt_Damaged: "Damage Report",
  vh_Purchase: "Supplier / Source",
  vh_Issue: "Issued to",
  vh_Return: "Returned by",
  vh_Repair: "Sent to",
  vh_Repaired: "Received from",
  vh_Damaged: "Reported by",
  sig_receivedQm: "Received by (QM Store)",
  sig_checked: "Checked by",
  sig_counter: "Countersigned (Adjt / OC)",
  sig_issuedQm: "Issued by (QM Store)",
  sig_receivedHolder: "Received by (Holder)",
  sig_returnedHolder: "Returned by (Holder)",
  sig_sentQm: "Sent by (QM Store)",
  sig_receivedRepair: "Received by (Repair)",
  sig_returnedRepair: "Returned by (Repair)",
  sig_reportedQm: "Reported by (QM Store)",
  sig_board: "Board / Witness",

  // Stored values shown as labels
  st_InStore: "In Store",
  st_Issued: "Issued",
  st_Repair: "Repair",
  st_Damaged: "Damaged",
  cond_Excellent: "Excellent",
  cond_Good: "Good",
  cond_Repairable: "Repairable",
  cond_Poor: "Poor",
  cat_Furniture: "Furniture",
  cat_Crockery: "Crockery",
  cat_Electrical: "Electrical",
  cat_Stationery: "Stationery",
  cat_Sports: "Sports",
  cat_Kitchen: "Kitchen",
  cat_Other: "Other",
  tx_Purchase: "Purchase",
  tx_Issue: "Issue",
  tx_Return: "Return",
  tx_Repair: "Repair",
  tx_Repaired: "Repaired",
  tx_Damaged: "Damaged",
};

export type MsgKey = keyof typeof en;

const bn: Record<MsgKey, string> = {
  appName: "৫ সিগন্যাল ব্যাটালিয়ন",
  appSub: "ইউনিট মালামাল",
  systemName: "UIMS · ইউনিট মালামাল ব্যবস্থাপনা সিস্টেম",
  navDashboard: "ড্যাশবোর্ড",
  navRegister: "মালামাল রেজিস্টার",
  logout: "লগআউট",
  darkMode: "ডার্ক মোড চালু করুন",
  lightMode: "লাইট মোড চালু করুন",
  langButton: "English",
  allSystems: "সব সিস্টেম",
  langTitle: "Switch to English (ইংরেজিতে দেখুন)",
  footerCopy: "© {year} ৫ সিগন্যাল ব্যাটালিয়ন · ইউনিট সম্পত্তি ব্যবস্থাপনা সিস্টেম",
  footerCourtesy: "সৌজন্যে: BA 11108 ক্যাপ্টেন আসিফ মাহমুদ, সিগস",
  brandSub: "ইউনিট মালামাল সিস্টেম",
  storeBanner: "কিউএম স্টোর",
  storeBannerSub: "ইউনিটের সম্পত্তির রেজিস্টার",
  storeChip: "ইউনিট মালামাল",
  connectedLocal: "সংযুক্ত · তথ্য এই কম্পিউটারে",
  collapseMenu: "মেনু ছোট করুন",
  expandMenu: "মেনু বড় করুন",
  eyebrowInv: "ইউনিট মালামাল",
  loginEyebrow: "নিরাপদ সাইন ইন",
  loginWelcome: "স্বাগতম",

  cancel: "বাতিল",
  close: "বন্ধ করুন",
  edit: "সম্পাদনা",
  delete: "মুছুন",
  open: "খুলুন",
  loading: "লোড হচ্ছে…",
  saving: "সংরক্ষণ হচ্ছে…",
  pleaseWait: "অপেক্ষা করুন…",
  openNewTab: "নতুন ট্যাবে খুলুন",
  optional: "ঐচ্ছিক",
  all: "সব",
  clear: "মুছে দিন",
  print: "প্রিন্ট",
  sessionExpired: "সেশনের মেয়াদ শেষ। অনুগ্রহ করে আবার লগইন করুন।",
  requestFailed: "অনুরোধটি সম্পন্ন হয়নি।",
  somethingWrong: "কিছু একটা সমস্যা হয়েছে।",

  loginPrompt: "৫ সিগন্যাল ব্যাটালিয়ন · অনুগ্রহ করে লগইন করুন",
  username: "ইউজার নেম",
  password: "পাসওয়ার্ড",
  show: "দেখান",
  hide: "লুকান",
  showPassword: "পাসওয়ার্ড দেখান",
  hidePassword: "পাসওয়ার্ড লুকান",
  login: "লগইন",
  loggingIn: "লগইন হচ্ছে…",
  loginFailed: "লগইন ব্যর্থ হয়েছে।",
  cannotReach: "সার্ভারে সংযোগ করা যাচ্ছে না। নেটওয়ার্ক দেখে আবার চেষ্টা করুন।",
  lanOnly: "শুধুমাত্র লোকাল ল্যান থেকে ব্যবহারযোগ্য",

  dashTitle: "ড্যাশবোর্ড",
  dashSub: "এক নজরে ইউনিটের মালামাল",
  dashLines: "{n}টি মালামাল লাইন",
  openRegister: "রেজিস্টার খুলুন",
  addItem: "+ নতুন মালামাল",
  cardTotal: "মোট মালামাল",
  cardStore: "স্টোরে",
  cardIssued: "ইস্যুকৃত",
  cardRepair: "মেরামতে",
  cardDamaged: "ক্ষতিগ্রস্ত",
  viewItems: "মালামাল দেখুন →",
  whoHolds: "কার কাছে কী আছে",
  holdersCount: "{n} জনের কাছে ইস্যুকৃত মালামাল আছে",
  holdersHint: "ধারক অনুযায়ী ইস্যুকৃত মালামাল",
  findHolder: "ধারক বা মালামাল খুঁজুন",
  noMatch: "কিছু পাওয়া যায়নি।",
  nothingIssued: "এখন কিছুই ইস্যু করা নেই — সব মালামাল স্টোরে আছে।",
  recentTitle: "সাম্প্রতিক কার্যক্রম",
  recentSub: "সর্বশেষ ১০টি ক্রয়, ইস্যু, ফেরত ও মেরামত",
  noActivity: "এখনো কোনো কার্যক্রম নেই।",

  colSer: "ক্রমিক",
  colItem: "মালামাল",
  colCategory: "শ্রেণি",
  colTotal: "মোট",
  colInStore: "স্টোরে",
  colIssued: "ইস্যুকৃত",
  colRepair: "মেরামতে",
  colDamaged: "ক্ষতিগ্রস্ত",
  colStatus: "অবস্থা",
  colHeldBy: "ধারক",
  colHolder: "ধারক",
  colQty: "পরিমাণ",
  colSince: "তারিখ থেকে",
  colDate: "তারিখ",
  colType: "ধরন",
  colLocation: "অবস্থান",
  colVoucherNote: "ভাউচার / নোট",
  colRemarks: "মন্তব্য",
  colInvNo: "ইনভেন্টরি নং",
  colVoucherNo: "ভাউচার নং",
  colBuyDate: "ক্রয়ের তারিখ",
  colCost: "মূল্য",
  colCondition: "মালের অবস্থা",

  regTitle: "মালামাল রেজিস্টার",
  regSub: "যেকোনো মালামালে ক্লিক করে দেখুন কোথায় আছে, ইস্যু করুন, ফেরত নিন বা সম্পাদনা করুন।",
  searchPh: "মালামাল, ইনভেন্টরি নং, ধারক, ভাউচার, অবস্থান খুঁজুন…",
  search: "খুঁজুন",
  allCategories: "সব শ্রেণি",
  anyStatus: "সব অবস্থা",
  has_InStore: "স্টোরে আছে",
  has_Issued: "ইস্যু করা আছে",
  has_Repair: "মেরামতে আছে",
  has_Damaged: "ক্ষতিগ্রস্ত আছে",
  exportCsv: "CSV এক্সপোর্ট",
  noItems: "এখনো কোনো মালামাল নেই।",
  addFirst: "প্রথম মালামাল যোগ করুন",
  noFilterMatch: "এই ফিল্টারে কিছু পাওয়া যায়নি।",
  clearFilters: "ফিল্টার মুছুন",
  showing: "{total}টির মধ্যে {shown}টি মালামাল লাইন দেখানো হচ্ছে · মোট {pieces}টি",
  printTitle: "৫ সিগন্যাল ব্যাটালিয়ন — ইউনিট মালামাল রেজিস্টার",
  printed: "প্রিন্টের সময় {date} · {n}টি মালামাল লাইন",
  filterCategory: "শ্রেণি: {v}",
  filterStatus: "অবস্থা: {v}",
  filterSearch: "অনুসন্ধান: “{v}”",
  sigPrepared: "প্রস্তুতকারী (কিউএম স্টোর)",
  sigChecked: "যাচাইকারী",
  sigCounter: "প্রতিস্বাক্ষর (অ্যাডজুট্যান্ট / ওসি)",
  deleted: "{no} মুছে ফেলা হয়েছে।",
  added: "{no} রেজিস্টারে যোগ করা হয়েছে।",
  changesSaved: "পরিবর্তন সংরক্ষণ করা হয়েছে।",
  deleteTitle: "মালামাল মুছবেন?",
  deletePermanently: "স্থায়ীভাবে মুছুন",
  deleteMsg: "এবং এর সম্পূর্ণ ইতিহাস মুছে যাবে। এটি আর ফেরানো যাবে না।",
  printVoucher: "ভাউচার প্রিন্ট",
  msg_Issue: "{holder}-কে {qty}টি ইস্যু করা হয়েছে।",
  msg_Return: "{qty}টি স্টোরে ফেরত নেওয়া হয়েছে।",
  msg_ReturnFrom: "{holder}-এর কাছ থেকে {qty}টি স্টোরে ফেরত নেওয়া হয়েছে।",
  msg_Repair: "{qty}টি মেরামতে পাঠানো হয়েছে।",
  msg_Repaired: "মেরামত শেষে {qty}টি স্টোরে ফেরত এসেছে।",
  msg_Damaged: "{qty}টি ক্ষতিগ্রস্ত হিসেবে চিহ্নিত করা হয়েছে।",
  csvFile: "malamal-register",

  dInvNo: "ইনভেন্টরি নং",
  dBuyDate: "ক্রয়ের তারিখ",
  dCost: "মূল্য",
  dVoucherNo: "ভাউচার নং",
  dLocation: "অবস্থান",
  dCondition: "মালের অবস্থা",
  dHeldBy: "ধারক",
  dNobody: "কেউ নেই (সব স্টোরে)",
  dRemarks: "মন্তব্য",
  fileProductPhoto: "পণ্যের ছবি",
  fileVoucher: "ভাউচার",
  fileNotesheet: "নোটশিট",
  whereNow: "এখন কোথায় আছে",
  noStock: "কোনো মজুদ লিপিবদ্ধ নেই।",
  history: "ইতিহাস",
  noTxns: "এখনো কোনো লেনদেন নেই।",
  hQty: "পরিমাণ {n}",
  hVoucher: "ভাউচার {v}",
  nothing_InStore: "স্টোরে কিছু নেই",
  nothing_Issued: "কিছু ইস্যু করা নেই",
  nothing_Repair: "মেরামতে কিছু নেই",
  nothing_Damaged: "ক্ষতিগ্রস্ত কিছু নেই",

  mv_Issue_button: "ইস্যু",
  mv_Issue_title: "মালামাল ইস্যু",
  mv_Issue_note: "স্টোর থেকে কোনো ব্যক্তি, অফিস বা সেকশনকে মালামাল হস্তান্তর করুন।",
  mv_Return_button: "ফেরত",
  mv_Return_title: "স্টোরে ফেরত",
  mv_Return_note: "ইস্যুকৃত মালামাল স্টোরে ফেরত নিন। ধারক বেছে নিন, অথবা যেকোনো ধারক রেখে দিন।",
  mv_Repair_button: "মেরামতে পাঠান",
  mv_Repair_title: "মেরামতে প্রেরণ",
  mv_Repair_note: "স্টোর থেকে মালামাল মেরামতে পাঠান। মেরামত শেষে “মেরামত থেকে ফেরত” দিয়ে ফেরত আনুন।",
  mv_Repaired_button: "মেরামত থেকে ফেরত",
  mv_Repaired_title: "মেরামত থেকে ফেরত",
  mv_Repaired_note: "মেরামতকৃত মালামাল স্টোরে ফেরত নিন।",
  mv_Damaged_button: "ক্ষতিগ্রস্ত চিহ্নিত",
  mv_Damaged_title: "ক্ষতিগ্রস্ত হিসেবে চিহ্নিত",
  mv_Damaged_note: "অব্যবহারযোগ্য মালামাল স্টোর থেকে ক্ষতিগ্রস্ত তালিকায় সরিয়ে নিন।",
  confirmMove: "{action} নিশ্চিত করুন",
  qtyMax: "পরিমাণ (সর্বোচ্চ {n})",
  date: "তারিখ",
  voucherNoteNo: "ভাউচার / নোট নং",
  voucherNotePh: "ইস্যু ভাউচার / ফেরত নোট / মেরামত নোট",
  remarks: "মন্তব্য",
  issuedTo: "যাকে ইস্যু করা হচ্ছে",
  issuedToHint: "নাম / পদবি / অফিস / সেকশন",
  issuedToPh: "যেমন: Snk Asif / Coy Office",
  returnedFrom: "যার কাছ থেকে ফেরত",
  anyHolder: "যেকোনো ধারক ({n}টি ইস্যুকৃত)",
  holdsN: "{holder} — {n}টি আছে",
  errQty: "কমপক্ষে ১ পূর্ণসংখ্যা পরিমাণ লিখুন।",
  errOnly: "মাত্র {n}টি আছে।",
  errHolder: "কাকে ইস্যু করা হচ্ছে তা লিখুন।",

  addNewItem: "নতুন মালামাল যোগ",
  editItem: "মালামাল সম্পাদনা",
  willBeSaved: "সংরক্ষিত হবে এই নম্বরে:",
  saveChanges: "পরিবর্তন সংরক্ষণ",
  saveItem: "মালামাল সংরক্ষণ",
  secItem: "মালামাল",
  secPurchase: "ক্রয়",
  secInitial: "প্রাথমিক অবস্থা",
  secDocs: "কাগজপত্র",
  itemName: "মালামালের নাম",
  itemNamePh: "যেমন: অফিস টেবিল",
  category: "শ্রেণি",
  quantity: "পরিমাণ",
  qtyEditHint: "বাড়ালে স্টোরে যোগ হবে; কমালে স্টোর থেকে কমবে।",
  condition: "মালের অবস্থা",
  buyDate: "ক্রয়ের তারিখ",
  cost: "মূল্য (৳)",
  voucherNo: "ভাউচার নং",
  voucherNoPh: "যেমন: CRV 112",
  location: "অবস্থান",
  locationPh: "যেমন: কিউএম স্টোর",
  status: "অবস্থা",
  issueDate: "ইস্যুর তারিখ",
  initialHint: "নতুন মালামাল সাধারণত স্টোরে থাকে। পরে রেজিস্টার থেকে ইস্যু করুন।",
  voucherFile: "ভাউচার ফাইল",
  notesheet: "নোটশিট",
  productPhoto: "পণ্যের ছবি",
  photoHint: "বড় ছবি স্বয়ংক্রিয়ভাবে ছোট করা হয়।",
  remarksPh: "অতিরিক্ত তথ্য থাকলে লিখুন",
  newFile: "নতুন ফাইল:",
  currentKept: "আগের ফাইল রাখা হয়েছে।",
  errItemName: "মালামালের নাম লিখুন।",
  errQtyWhole: "কমপক্ষে ১, পূর্ণসংখ্যা লিখুন।",
  errBuyDate: "ক্রয়ের তারিখ বেছে নিন।",
  errCost: "সঠিক মূল্য লিখুন (০ বা বেশি)।",
  errVoucherNo: "ভাউচার নম্বর লিখুন।",
  errVoucherFile: "ভাউচার সংযুক্ত করুন (PDF বা ছবি)।",
  errIssuedTo: "কাকে ইস্যু করা হচ্ছে?",

  voucherLoading: "ভাউচার লোড হচ্ছে…",
  txnGone: "এই লেনদেনটি আর নেই।",
  officeCopy: "অফিস কপি",
  holderCopy: "ধারক কপি",
  cutHere: "✂ এখানে কাটুন",
  vVoucherNo: "ভাউচার / নোট নং",
  vDate: "তারিখ",
  vInvNo: "ইনভেন্টরি নং",
  vItem: "মালামাল",
  vCategory: "শ্রেণি",
  vQty: "পরিমাণ",
  vRemarks: "মন্তব্য",
  vt_Purchase: "প্রাপ্তি ভাউচার (ক্রয়)",
  vt_Issue: "ইস্যু ভাউচার",
  vt_Return: "প্রাপ্তি ভাউচার (স্টোরে ফেরত)",
  vt_Repair: "মেরামত ভাউচার",
  vt_Repaired: "প্রাপ্তি ভাউচার (মেরামত থেকে ফেরত)",
  vt_Damaged: "ক্ষতি প্রতিবেদন",
  vh_Purchase: "সরবরাহকারী / উৎস",
  vh_Issue: "যাকে ইস্যু করা হয়েছে",
  vh_Return: "ফেরতদাতা",
  vh_Repair: "যেখানে পাঠানো হয়েছে",
  vh_Repaired: "যার কাছ থেকে প্রাপ্ত",
  vh_Damaged: "প্রতিবেদনকারী",
  sig_receivedQm: "গ্রহণকারী (কিউএম স্টোর)",
  sig_checked: "যাচাইকারী",
  sig_counter: "প্রতিস্বাক্ষর (অ্যাডজুট্যান্ট / ওসি)",
  sig_issuedQm: "ইস্যুকারী (কিউএম স্টোর)",
  sig_receivedHolder: "গ্রহণকারী (ধারক)",
  sig_returnedHolder: "ফেরতদাতা (ধারক)",
  sig_sentQm: "প্রেরক (কিউএম স্টোর)",
  sig_receivedRepair: "গ্রহণকারী (মেরামত)",
  sig_returnedRepair: "ফেরতদাতা (মেরামত)",
  sig_reportedQm: "প্রতিবেদনকারী (কিউএম স্টোর)",
  sig_board: "বোর্ড / সাক্ষী",

  st_InStore: "স্টোরে",
  st_Issued: "ইস্যুকৃত",
  st_Repair: "মেরামতে",
  st_Damaged: "ক্ষতিগ্রস্ত",
  cond_Excellent: "চমৎকার",
  cond_Good: "ভালো",
  cond_Repairable: "মেরামতযোগ্য",
  cond_Poor: "খারাপ",
  cat_Furniture: "আসবাবপত্র",
  cat_Crockery: "ক্রোকারিজ",
  cat_Electrical: "বৈদ্যুতিক",
  cat_Stationery: "স্টেশনারি",
  cat_Sports: "খেলাধুলা",
  cat_Kitchen: "রান্নাঘর",
  cat_Other: "অন্যান্য",
  tx_Purchase: "ক্রয়",
  tx_Issue: "ইস্যু",
  tx_Return: "ফেরত",
  tx_Repair: "মেরামতে প্রেরণ",
  tx_Repaired: "মেরামত শেষে ফেরত",
  tx_Damaged: "ক্ষতিগ্রস্ত",
};

const DICTS: Record<Lang, Record<MsgKey, string>> = { en, bn };

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "bn";
}

/* ---------- Numbers ---------- */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

// 0-9 → ০-৯ in Bangla; everything else unchanged.
export function localDigits(value: string | number, lang: Lang) {
  const text = String(value);
  return lang === "bn" ? text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : text;
}

export function translate(lang: Lang, key: MsgKey, vars?: Record<string, string | number>) {
  let text = DICTS[lang][key] ?? en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, typeof value === "number" ? localDigits(value, lang) : value);
    }
  }
  return text;
}

// Labels for stored English values (status, condition, category, type).
// Unknown values (e.g. a custom category) are shown as typed.
function labelFor(prefix: string, value: string, lang: Lang) {
  const key = `${prefix}${value.replace(/\s+/g, "")}` as MsgKey;
  return key in en ? translate(lang, key) : value;
}

export const statusLabel = (v: string, lang: Lang) => labelFor("st_", v, lang);
export const conditionLabel = (v: string, lang: Lang) => labelFor("cond_", v, lang);
export const categoryLabel = (v: string, lang: Lang) => labelFor("cat_", v, lang);
export const txnLabel = (v: string, lang: Lang) => labelFor("tx_", v, lang);

/* ---------- Quantity in words (for vouchers) ---------- */

const EN_ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const EN_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function englishWords(n: number): string {
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? ` ${EN_ONES[n % 10]}` : "");
  if (n < 1000) return `${EN_ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${englishWords(n % 100)}` : ""}`;
  if (n < 1_000_000) {
    return `${englishWords(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${englishWords(n % 1000)}` : ""}`;
  }
  return String(n);
}

// Bangla numbers 0–99 each have their own word.
const BN_0_99 = (
  "শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ " +
  "বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ ঊনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ " +
  "পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ " +
  "ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ একান্ন বায়ান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন " +
  "আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর " +
  "একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি " +
  "তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি ঊননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই " +
  "পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই"
).split(" ");

function banglaWords(n: number): string {
  if (n < 100) return BN_0_99[n];
  const parts: string[] = [];
  const lakh = Math.floor(n / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (lakh) parts.push(`${banglaWords(lakh)} লক্ষ`);
  if (thousand) parts.push(`${BN_0_99[thousand]} হাজার`);
  if (hundred) parts.push(`${BN_0_99[hundred]}শত`);
  if (rest) parts.push(BN_0_99[rest]);
  return parts.join(" ");
}

export function numberInWords(n: number, lang: Lang) {
  return lang === "bn" ? banglaWords(n) : englishWords(n);
}

/* ---------- Server messages ---------- */

// The server answers in English; these rules turn its messages into Bangla.
const FIELD_BN: Record<string, string> = {
  "Item Name": "মালামালের নাম",
  Category: "শ্রেণি",
  Quantity: "পরিমাণ",
  "Buying Date": "ক্রয়ের তারিখ",
  "Voucher No": "ভাউচার নং",
  "Voucher File": "ভাউচার ফাইল",
  Notesheet: "নোটশিট",
  "Product Photo": "পণ্যের ছবি",
  Location: "অবস্থান",
  "Issued To": "যাকে ইস্যু",
  "Issue Date": "ইস্যুর তারিখ",
  Remarks: "মন্তব্য",
  "Voucher / Note No": "ভাউচার / নোট নং",
  Date: "তারিখ",
  Issue: "ইস্যু",
  Return: "ফেরত",
  Repair: "মেরামত",
  "Back from repair": "মেরামত থেকে ফেরত",
  Damaged: "ক্ষতিগ্রস্ত",
  "In Store": "স্টোরে থাকা",
  Issued: "ইস্যুকৃত",
};

const field = (name: string) => FIELD_BN[name] || name;
const bnNum = (n: string) => localDigits(n, "bn");

const EXACT_BN: Record<string, string> = {
  "Valid cost is required.": "সঠিক মূল্য লিখুন।",
  "Condition is required.": "মালের অবস্থা বেছে নিন।",
  "Status is not valid.": "অবস্থা সঠিক নয়।",
  "Unknown transaction type.": "অজানা লেনদেনের ধরন।",
  "Issued To is required when status is Issued.": "অবস্থা ইস্যুকৃত হলে কাকে ইস্যু করা হয়েছে তা লিখুন।",
  "This inventory number already exists.": "এই ইনভেন্টরি নম্বর আগে থেকেই আছে।",
  "Item not found.": "মালামাল পাওয়া যায়নি।",
  "Cannot reduce quantity: not enough of this item is In Store. Return issued items first.":
    "পরিমাণ কমানো যাবে না: স্টোরে যথেষ্ট নেই। আগে ইস্যুকৃত মালামাল ফেরত নিন।",
  "Please log in again.": "অনুগ্রহ করে আবার লগইন করুন।",
  "Something went wrong on the server.": "সার্ভারে সমস্যা হয়েছে।",
  "Invalid request body.": "অনুরোধটি সঠিক নয়।",
  "Invalid request.": "অনুরোধটি সঠিক নয়।",
  "File is too large (max 10 MB).": "ফাইল অনেক বড় (সর্বোচ্চ ১০ এমবি)।",
  "No file uploaded.": "কোনো ফাইল আপলোড হয়নি।",
  "Only PDF, JPG, PNG and WebP files are allowed.": "শুধু PDF, JPG, PNG ও WebP ফাইল দেওয়া যাবে।",
  "File not found.": "ফাইল পাওয়া যায়নি।",
  "Too many failed attempts. Try again in 15 minutes.": "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
  "Invalid username or password.": "ইউজার নেম বা পাসওয়ার্ড ভুল।",
  "Session expired. Please log in again.": "সেশনের মেয়াদ শেষ। অনুগ্রহ করে আবার লগইন করুন।",
  "Request failed.": "অনুরোধটি সম্পন্ন হয়নি।",
  "Something went wrong.": "কিছু একটা সমস্যা হয়েছে।",
};

const PATTERNS_BN: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+) is too long \(max (\d+) characters\)\.$/, (m) => `${field(m[1])} অনেক বড় (সর্বোচ্চ ${bnNum(m[2])} অক্ষর)।`],
  [/^(.+) is required\.$/, (m) => `${field(m[1])} আবশ্যক।`],
  [/^(.+) must be a valid date\.$/, (m) => `${field(m[1])} সঠিক তারিখ হতে হবে।`],
  [/^(.+) is not a valid file\.$/, (m) => `${field(m[1])} সঠিক ফাইল নয়।`],
  [/^(.+) must be a whole number of at least 1\.$/, (m) => `${field(m[1])} কমপক্ষে ১ এবং পূর্ণসংখ্যা হতে হবে।`],
  [/^(.+) is too large\.$/, (m) => `${field(m[1])} অনেক বেশি।`],
  [
    /^(.+) quantity cannot exceed (.+) quantity \((\d+) available(?: with (.+))?\)\.$/,
    (m) =>
      `${field(m[1])}-এর পরিমাণ ${field(m[2])} পরিমাণের বেশি হতে পারবে না (${
        m[4] ? `${m[4]}-এর কাছে ` : ""
      }${bnNum(m[3])}টি আছে)।`,
  ],
];

export function localizeMessage(text: string, lang: Lang) {
  if (lang === "en") return text;
  if (EXACT_BN[text]) return EXACT_BN[text];
  for (const [pattern, render] of PATTERNS_BN) {
    const match = text.match(pattern);
    if (match) return render(match);
  }
  return text;
}
