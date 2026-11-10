import type { AppSettings, Category, RecordKind, Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  co: "CO",
  "2ic": "2IC",
  adjt: "Adjutant",
  coy_comd: "Coy Comd",
  coy_rep: "Coy Rep",
  bn_rep: "Bn Rep",
  clk: "Clerk",
  soldier: "Individual Soldier",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Super admin — full control of the whole unit (technical admin)",
  co: "Super admin — full control of the whole unit",
  "2ic": "Super admin — full control of the whole unit",
  adjt: "Super admin — full control of the whole unit",
  coy_comd: "Admin of his own coy — approves leave & profile updates, coy training plan, programme, notices, coy logins",
  coy_rep: "Own coy only — daily parade state, duty roster, add / update / remove coy soldiers, training results, leave on behalf",
  bn_rep: "BSM / Bn Daily — prepares the full battalion parade state (all coys) and the duty roster; views the whole unit",
  clk: "Whole unit — view & sort all records; updates personal info and training",
  soldier: "Himself — requests profile updates, applies for leave, sees duties, programme and training",
};

export const ALL_ROLES: Role[] = ["admin", "co", "2ic", "adjt", "coy_comd", "coy_rep", "bn_rep", "clk", "soldier"];
export const CATEGORIES: Category[] = ["Offr", "JCO", "OR"];
export const SOLDIER_STATUSES = ["Serving", "Retired", "Discharged", "Transferred Out", "Deceased", "Deserted"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const RELIGIONS = ["Islam", "Hinduism", "Buddhism", "Christianity", "Other"];
export const MARITAL_STATUSES = ["Unmarried", "Married", "Widower", "Divorced"];
export const MEDICAL_CATEGORIES = ["A", "B", "C", "D", "E"];
export const EDUCATION_LEVELS = ["Below SSC", "SSC", "HSC", "Diploma", "Graduate", "Masters", "Other"];
export const ATTS_TYPES = ["Temp Atts", "Perm Atts"];
export const RELATIONS = ["Wife", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"];

export const DIVISIONS: Record<string, string[]> = {
  Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  Chattogram: ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  Rajshahi: ["Bogura", "Chapai Nawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"],
  Khulna: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
};
export const ALL_DISTRICTS = Object.values(DIVISIONS).flat().sort();
export const divisionOf = (district: string | null | undefined) =>
  district ? Object.entries(DIVISIONS).find(([, list]) => list.includes(district))?.[0] ?? null : null;

export const DEFAULT_SETTINGS: AppSettings = {
  unit: { name: "5 Signal Battalion", short: "5 SIG BN", motto: "Unit Management System" },
  absent_reasons: ["Leave", "Course", "Hospital", "Temp Atts", "Perm Atts", "AWOL", "Other"],
  employment_types: ["Duty Offr", "Duty JCO", "Duty NCO", "Office", "Workshop", "MT", "Mess", "Drill Team", "Athletics Team", "Gp Training", "Cadre/Course", "Excused Duty", "Light Duty", "Other"],
  duty_types: ["Duty Offr", "Duty JCO", "Duty NCO", "Quarter Guard", "Duty Runner", "Duty Clk", "Night Picket", "Station Duty (Mess B)"],
  ranks: { Offr: ["Lt Col", "Maj", "Capt", "Lt"], JCO: ["H/Capt", "H/Lt", "MWO", "SWO", "WO"], OR: ["Sgt", "Cpl", "L/Cpl", "Snk"] },
  trades: ["Operator", "Technician", "Wireman Sigs", "Driver", "Clerk", "Crypto", "SMT", "Cook (Mess)", "Cook (Unit)", "E&BR", "C&L"],
  retirement_rules: { svc_years_by_rank: {}, age_limit_by_category: {} },
  training_exemption: { age: 45, med_cats: ["B", "C", "D"], tests: ["IPFT", "RET", "SM"] },
  parade_windows: { open_time: "18:00", morning_close: "03:00", second_close: "15:00", extra_close: "23:59" },
  officer_appointments: ["Adjt", "QM", "Coy Comd", "2IC", "CO"],
};
// ---- officers' tasks
export const TASK_STATUSES = ["Pending", "In Progress", "Completed", "On Hold"] as const;
/** status colours: Pending amber, In Progress blue, Completed green, Overdue red, On Hold purple-grey */
export const TASK_STATUS_COLOR: Record<string, string> = { Pending: "#d39a3a", "In Progress": "#2f78b7", Completed: "#3f8f55", Overdue: "#c0392b", "On Hold": "#7d6f9a" };
export const TASK_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: "Admin", color: "#5b7083" }, { name: "Training", color: "#2f8f6f" }, { name: "Operations", color: "#a5462f" },
  { name: "Inquiry / Board", color: "#7a5bc7" }, { name: "Inspection", color: "#b07812" }, { name: "Course / Cadre", color: "#2c8c99" },
  { name: "Welfare", color: "#c2577a" }, { name: "Signals / Technical", color: "#2f669f" }, { name: "Other", color: "#6b7a86" },
];
export const TASK_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
/** Overdue is worked out from the deadline and today's Bangladesh date (not stored). */
export const taskState = (t: { status: string; deadline: string | null }, today: string) =>
  t.status !== "Completed" && t.status !== "On Hold" && t.deadline && t.deadline < today ? "Overdue" : t.status;

/** The official companies / sub-units of the unit (Settings → Companies → Apply standard unit list). */
export const STANDARD_UNITS: Array<{ slug: string; name: string; short: string; also?: string[] }> = [
  { slug: "bhq", name: "BHQ Pl", short: "BHQ", also: ["bhq", "battalion hq", "bn hq"] },
  { slug: "hq", name: "HQ Coy", short: "HQ" },
  { slug: "rdo", name: "Radio Coy", short: "Radio", also: ["rdo coy", "rdo", "radio"] },
  { slug: "op", name: "Op Coy", short: "Op" },
  { slug: "rr", name: "RR & Line Coy", short: "RR & Line", also: ["rr coy", "rr", "rr & line"] },
  { slug: "106-bsc", name: "106 BSC", short: "106" },
  { slug: "113-bsc", name: "113 BSC", short: "113" },
  { slug: "121-bsc", name: "121 BSC", short: "121" },
  { slug: "205-absc", name: "205 ABSC", short: "205" },
  { slug: "eme", name: "EME Sec", short: "EME", also: ["eme", "eme sec", "eme section"] },
];
export const ACCOMMODATION = ["Snk Lines", "Family Quarter", "Out Living"] as const;
export const CYCLE_ACTIVITIES = ["Indl Training", "Group Training", "Unit Admin", "Privilege Leave"] as const;
export const CYCLE_COLORS: Record<string, string> = { "Indl Training": "#2f78b7", "Group Training": "#3f8f55", "Unit Admin": "#b36a1d", "Privilege Leave": "#2c9fb9" };
export const CYCLE_SHORT: Record<string, string> = { "Indl Training": "Indl Trg", "Group Training": "Gp Trg", "Unit Admin": "Unit Admin", "Privilege Leave": "PL" };
/** Cycle 1 = Jan–Mar … Cycle 4 = Oct–Dec */
export const CYCLES = [
  { n: 1, key: "c1", label: "Cycle 1", months: "Jan – Mar" },
  { n: 2, key: "c2", label: "Cycle 2", months: "Apr – Jun" },
  { n: 3, key: "c3", label: "Cycle 3", months: "Jul – Sep" },
  { n: 4, key: "c4", label: "Cycle 4", months: "Oct – Dec" },
] as const;
export const cycleOf = (isoDate: string) => Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1;
/** What a soldier does in the cycle of the given date (from his cycle plan). */
export const cycleActivityOn = (plan: { c1: string | null; c2: string | null; c3: string | null; c4: string | null } | null | undefined, isoDate: string) =>
  plan ? (plan[`c${cycleOf(isoDate)}` as "c1"] ?? null) : null;
// Fields a soldier may request to change on his own file (must match SQL self_editable_fields()).
// v2.1: every personal-info field; the Coy Comd verifies before it is written to the file.
// Personal No, company, status, attachment and office remarks stay with the Orderly Room.
export const SELF_EDITABLE_FIELDS = [
  "category", "rank", "trade", "name", "name_bn", "platoon", "appointment", "date_joined_unit", "previous_unit",
  "date_of_birth", "date_of_enrolment", "date_of_rank", "retirement_date",
  "height_in", "weight_lbs", "blood_group", "medical_category", "medical_remarks",
  "religion", "marital_status", "date_of_marriage", "spouse_name", "education", "nid_no",
  "home_division", "home_district", "home_upazila", "distance_from_ib_km", "permanent_address", "present_address",
  "accommodation", "accommodation_details",
  "mobile", "alt_mobile", "email", "emergency_name", "emergency_relation", "emergency_mobile",
] as const;
export const SELF_EDITABLE_KINDS: RecordKind[] = ["family", "education", "course", "posting", "award", "medical", "vehicle"];
// v3.4 — an individual may ask for a change to ANY of his information (full info). The Coy Comd
// (or Adjt) approves before anything is written. Not requestable: Personal No (it is the login ID)
// and the serving status (set by the Orderly Room).
export const REQUESTABLE_FIELDS = [
  ...SELF_EDITABLE_FIELDS, "company_id", "atts_type", "atts_location", "atts_from", "atts_to", "remarks",
] as const;
export const REQUESTABLE_KINDS: RecordKind[] = ["family", "education", "course", "discipline", "award", "posting", "vehicle", "report", "medical"];

// Personal information every soldier must have on file (first login / new ID application).
export const REQUIRED_PROFILE_FIELDS = [
  "name_bn", "date_of_birth", "date_of_enrolment", "height_in", "weight_lbs", "blood_group",
  "religion", "marital_status", "education", "nid_no",
  "home_district", "home_upazila", "distance_from_ib_km", "permanent_address", "present_address",
  "accommodation", "mobile", "emergency_name", "emergency_relation", "emergency_mobile",
] as const;
/** Fields still empty on a soldier's file (spouse details only when married). */
export function missingProfileFields(s: Record<string, unknown> | null | undefined): string[] {
  if (!s) return [];
  const blank = (k: string) => s[k] === null || s[k] === undefined || String(s[k]).trim() === "";
  const req: string[] = [...REQUIRED_PROFILE_FIELDS];
  if (s.marital_status === "Married") req.push("spouse_name", "date_of_marriage");
  return req.filter(blank);
}

// ---------------------------------------------------------------------------
// Soldier master-record fields, grouped for forms and the profile page.
// ---------------------------------------------------------------------------
export type FieldType = "text" | "date" | "number" | "select" | "textarea" | "company" | "rank" | "trade" | "district";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  hint?: string;
  wide?: boolean;
}

export const SOLDIER_FIELD_GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Identity",
    fields: [
      { key: "snk_no", label: "Personal No", type: "text", required: true },
      { key: "category", label: "Category", type: "select", options: CATEGORIES, required: true },
      { key: "rank", label: "Rank", type: "rank", required: true },
      { key: "name", label: "Name (English)", type: "text", required: true },
      { key: "name_bn", label: "Name (Bangla)", type: "text" },
      { key: "trade", label: "Trade", type: "trade" },
    ],
  },
  {
    title: "Unit Posting",
    fields: [
      { key: "company_id", label: "Company", type: "company", required: true },
      { key: "platoon", label: "Platoon / Section", type: "text" },
      { key: "appointment", label: "Appointment", type: "text" },
      { key: "status", label: "Status", type: "select", options: SOLDIER_STATUSES, required: true },
      { key: "date_joined_unit", label: "Date Joined Unit", type: "date" },
      { key: "previous_unit", label: "Previous Unit", type: "text" },
    ],
  },
  {
    title: "Service",
    fields: [
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "date_of_enrolment", label: "Date of Enrolment / Commission", type: "date" },
      { key: "date_of_rank", label: "Date of Present Rank", type: "date" },
      { key: "retirement_date", label: "Retirement / LPR Date", type: "date", hint: "Used for 'service left'" },
    ],
  },
  {
    title: "Physical & Medical",
    fields: [
      { key: "height_in", label: "Height (inches)", type: "number", hint: "e.g. 66 = 5'6\"" },
      { key: "weight_lbs", label: "Weight (lbs)", type: "number" },
      { key: "blood_group", label: "Blood Group", type: "select", options: BLOOD_GROUPS },
      { key: "medical_category", label: "Medical Category", type: "select", options: MEDICAL_CATEGORIES },
      { key: "medical_remarks", label: "Medical Remarks", type: "text", wide: true },
    ],
  },
  {
    title: "Personal",
    fields: [
      { key: "religion", label: "Religion", type: "select", options: RELIGIONS },
      { key: "marital_status", label: "Marital Status", type: "select", options: MARITAL_STATUSES },
      { key: "date_of_marriage", label: "Date of Marriage", type: "date" },
      { key: "spouse_name", label: "Spouse Name", type: "text" },
      { key: "education", label: "Highest Education", type: "select", options: EDUCATION_LEVELS },
      { key: "nid_no", label: "NID No", type: "text" },
    ],
  },
  {
    title: "Home & Contact",
    fields: [
      { key: "home_district", label: "Home District", type: "district" },
      { key: "home_upazila", label: "Upazila / Thana", type: "text" },
      { key: "distance_from_ib_km", label: "Distance from International Boundary (km)", type: "number", hint: "From home to the nearest border (approx.)" },
      { key: "accommodation", label: "Living in", type: "select", options: ["Snk Lines", "Family Quarter", "Out Living"] },
      { key: "accommodation_details", label: "Quarter No / House address", type: "text", hint: "Family quarter number, or out-living house address" },
      { key: "mobile", label: "Mobile", type: "text" },
      { key: "alt_mobile", label: "Alternate Mobile", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "permanent_address", label: "Permanent Address", type: "textarea", wide: true },
      { key: "present_address", label: "Present Address", type: "textarea", wide: true },
    ],
  },
  {
    title: "Emergency Contact",
    fields: [
      { key: "emergency_name", label: "Name", type: "text" },
      { key: "emergency_relation", label: "Relation", type: "select", options: RELATIONS },
      { key: "emergency_mobile", label: "Mobile", type: "text" },
    ],
  },
  {
    title: "Attachment",
    fields: [
      { key: "atts_type", label: "Attachment Type", type: "select", options: ATTS_TYPES, hint: "Shows as absent in parade state" },
      { key: "atts_location", label: "Attached To", type: "text" },
      { key: "atts_from", label: "From", type: "date" },
      { key: "atts_to", label: "To", type: "date" },
    ],
  },
  {
    title: "Remarks",
    fields: [{ key: "remarks", label: "Remarks", type: "textarea", wide: true }],
  },
];
export const SOLDIER_FIELDS: FieldDef[] = SOLDIER_FIELD_GROUPS.flatMap((g) => g.fields).concat([
  { key: "home_division", label: "Home Division", type: "text" },
]);
export const fieldLabel = (key: string) => SOLDIER_FIELDS.find((f) => f.key === key)?.label ?? key;

// ---------------------------------------------------------------------------
// Sub-records kept on each soldier's file
// ---------------------------------------------------------------------------
export interface RecordKindDef {
  kind: RecordKind;
  title: string;
  dateKey?: string; // which field mirrors record_date (for sorting)
  fields: FieldDef[];
}
export const RECORD_KINDS: Record<RecordKind, RecordKindDef> = {
  family: {
    kind: "family",
    title: "Family Members",
    dateKey: "date_of_birth",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "relation", label: "Relation", type: "select", options: RELATIONS, required: true },
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "occupation", label: "Occupation / Class", type: "text" },
      { key: "mobile", label: "Mobile", type: "text" },
      { key: "nid", label: "NID / Birth Reg No", type: "text" },
    ],
  },
  education: {
    kind: "education",
    title: "Civil Education",
    fields: [
      { key: "exam", label: "Examination", type: "text", required: true },
      { key: "institution", label: "Board / Institution", type: "text" },
      { key: "year", label: "Passing Year", type: "text" },
      { key: "result", label: "Result / GPA", type: "text" },
    ],
  },
  course: {
    kind: "course",
    title: "Military Courses (past)",
    dateKey: "from",
    fields: [
      { key: "course", label: "Course", type: "text", required: true },
      { key: "institution", label: "Institution", type: "text" },
      { key: "from", label: "From", type: "date" },
      { key: "to", label: "To", type: "date" },
      { key: "result", label: "Result / Grading", type: "text" },
    ],
  },
  discipline: {
    kind: "discipline",
    title: "Discipline / Punishment",
    dateKey: "date",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "offence", label: "Offence", type: "text", required: true },
      { key: "section", label: "Army Act Section", type: "text" },
      { key: "punishment", label: "Punishment Awarded", type: "text" },
      { key: "awarded_by", label: "Awarded By", type: "text" },
      { key: "remarks", label: "Remarks", type: "text" },
    ],
  },
  award: {
    kind: "award",
    title: "Awards & Commendations",
    dateKey: "date",
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "award", label: "Award / Medal", type: "text", required: true },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },
  posting: {
    kind: "posting",
    title: "Service / Posting History",
    dateKey: "from",
    fields: [
      { key: "unit", label: "Unit / Formation", type: "text", required: true },
      { key: "appointment", label: "Appointment", type: "text" },
      { key: "from", label: "From", type: "date" },
      { key: "to", label: "To", type: "date" },
    ],
  },
  vehicle: {
    kind: "vehicle",
    title: "Personal Vehicles",
    dateKey: "permission_valid_till",
    fields: [
      { key: "vehicle_type", label: "Vehicle", type: "select", options: ["Bicycle", "Motorcycle", "Scooty", "Car", "Microbus / Jeep", "Other"], required: true },
      { key: "make_model", label: "Make / model", type: "text", hint: "e.g. Honda CB Hornet 160R" },
      { key: "reg_no", label: "Registration No", type: "text", hint: "e.g. Bogura Ha 11-2233 (not for bicycle)" },
      { key: "colour", label: "Colour", type: "text" },
      { key: "owner", label: "Owner", type: "select", options: ["Self", "Wife", "Family member", "Other"] },
      { key: "licence_no", label: "Driving licence No", type: "text" },
      { key: "licence_type", label: "Licence type", type: "select", options: ["Motorcycle", "Light (non-professional)", "Light (professional)", "Medium", "Heavy", "Not required"] },
      { key: "licence_expiry", label: "Licence valid till", type: "date" },
      { key: "permission", label: "Stn HQ permission", type: "select", options: ["Granted", "Applied", "Not applied", "Not required"] },
      { key: "permission_no", label: "Permission / sticker No", type: "text" },
      { key: "permission_date", label: "Permission date", type: "date" },
      { key: "permission_valid_till", label: "Permission valid till", type: "date" },
      { key: "remarks", label: "Remarks", type: "text" },
    ],
  },
  report: {
    kind: "report",
    title: "Annual Progress Reports (APR / OPR)",
    dateKey: "year",
    fields: [
      { key: "year", label: "Year", type: "number", required: true },
      { key: "type", label: "Report", type: "select", options: ["APR", "OPR"], required: true, hint: "APR for JCO / OR, OPR for officers" },
      { key: "marks", label: "Marks", type: "number" },
      { key: "grading", label: "Grading", type: "select", options: ["Outstanding", "Above Average", "High Average", "Average", "Below Average"] },
      { key: "remarks", label: "Remarks", type: "text" },
      { key: "initiated_by", label: "Initiating Officer", type: "text" },
    ],
  },
  medical: {
    kind: "medical",
    title: "Medical History",
    dateKey: "date",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "category", label: "Med Category", type: "select", options: MEDICAL_CATEGORIES },
      { key: "diagnosis", label: "Diagnosis / Board", type: "text" },
      { key: "restriction", label: "Restriction", type: "text" },
      { key: "review_date", label: "Review Date", type: "date" },
    ],
  },
};

export const LEAVE_STATUS_TONE: Record<string, string> = {
  Applied: "amber",
  Recommended: "blue",
  Approved: "green",
  Rejected: "red",
  Cancelled: "grey",
};
