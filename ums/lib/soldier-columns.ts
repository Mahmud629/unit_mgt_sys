import type { AppSettings, Company, Soldier } from "./types";
import { ageYears, fmtDate, heightLabel, retirementDate, serviceLeftYears, serviceYears, ymLabel } from "./utils";

export interface Ctx {
  companyById: Map<string, Company>;
  settings: AppSettings;
}
export interface Column {
  key: string;
  label: string;
  /** value used for sorting */
  sort: (s: Soldier, c: Ctx) => string | number | null;
  /** value shown in the table */
  show: (s: Soldier, c: Ctx) => string;
  /** value written to Excel (defaults to show) */
  xl?: (s: Soldier, c: Ctx) => string | number | null;
  num?: boolean;
  default?: boolean;
}
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export const SOLDIER_COLUMNS: Column[] = [
  { key: "snk_no", label: "Personal No", sort: (s) => s.snk_no, show: (s) => s.snk_no, default: true },
  { key: "rank", label: "Rank", sort: (s) => s.rank, show: (s) => s.rank, default: true },
  { key: "name", label: "Name", sort: (s) => s.name, show: (s) => s.name, default: true },
  { key: "company", label: "Coy", sort: (s, c) => c.companyById.get(s.company_id)?.display_order ?? 99, show: (s, c) => c.companyById.get(s.company_id)?.short_name ?? "", xl: (s, c) => c.companyById.get(s.company_id)?.name ?? "", default: true },
  { key: "trade", label: "Trade", sort: (s) => s.trade, show: (s) => s.trade ?? "", default: true },
  { key: "category", label: "Cat", sort: (s) => s.category, show: (s) => s.category },
  { key: "appointment", label: "Appointment", sort: (s) => s.appointment, show: (s) => s.appointment ?? "" },
  { key: "age", label: "Age", sort: (s) => ageYears(s), show: (s) => ymLabel(ageYears(s)), xl: (s) => round1(ageYears(s)), num: true, default: true },
  { key: "svc", label: "Svc", sort: (s) => serviceYears(s), show: (s) => ymLabel(serviceYears(s)), xl: (s) => round1(serviceYears(s)), num: true, default: true },
  { key: "svc_left", label: "Svc Left", sort: (s, c) => serviceLeftYears(s, c.settings), show: (s, c) => ymLabel(serviceLeftYears(s, c.settings)), xl: (s, c) => round1(serviceLeftYears(s, c.settings)), num: true, default: true },
  { key: "retirement", label: "Retirement", sort: (s, c) => retirementDate(s, c.settings).date, show: (s, c) => { const r = retirementDate(s, c.settings); return r.date ? fmtDate(r.date) + (r.estimated ? "*" : "") : ""; }, xl: (s, c) => retirementDate(s, c.settings).date },
  { key: "height", label: "Height", sort: (s) => s.height_in, show: (s) => heightLabel(s.height_in), xl: (s) => s.height_in, num: true, default: true },
  { key: "weight", label: "Wt (lbs)", sort: (s) => s.weight_lbs, show: (s) => (s.weight_lbs ? String(s.weight_lbs) : ""), xl: (s) => s.weight_lbs, num: true },
  { key: "home_district", label: "Home Dist", sort: (s) => s.home_district, show: (s) => s.home_district ?? "", default: true },
  { key: "distance_ib", label: "Dist from IB (km)", sort: (s) => s.distance_from_ib_km, show: (s) => (s.distance_from_ib_km ?? "") === "" ? "" : String(s.distance_from_ib_km), xl: (s) => s.distance_from_ib_km, num: true },
  { key: "accommodation", label: "Living in", sort: (s) => s.accommodation, show: (s) => s.accommodation ?? "" },
  { key: "accommodation_details", label: "Quarter / Address", sort: (s) => s.accommodation_details, show: (s) => s.accommodation_details ?? "" },
  { key: "home_division", label: "Division", sort: (s) => s.home_division, show: (s) => s.home_division ?? "" },
  { key: "blood_group", label: "Blood", sort: (s) => s.blood_group, show: (s) => s.blood_group ?? "", default: true },
  { key: "medical_category", label: "Med Cat", sort: (s) => s.medical_category, show: (s) => s.medical_category ?? "" },
  { key: "religion", label: "Religion", sort: (s) => s.religion, show: (s) => s.religion ?? "" },
  { key: "marital_status", label: "Marital", sort: (s) => s.marital_status, show: (s) => s.marital_status ?? "" },
  { key: "education", label: "Education", sort: (s) => s.education, show: (s) => s.education ?? "" },
  { key: "mobile", label: "Mobile", sort: (s) => s.mobile, show: (s) => s.mobile ?? "", default: true },
  { key: "date_of_birth", label: "DOB", sort: (s) => s.date_of_birth, show: (s) => fmtDate(s.date_of_birth), xl: (s) => s.date_of_birth },
  { key: "date_of_enrolment", label: "Enrolment", sort: (s) => s.date_of_enrolment, show: (s) => fmtDate(s.date_of_enrolment), xl: (s) => s.date_of_enrolment },
  { key: "date_of_rank", label: "Date of Rank", sort: (s) => s.date_of_rank, show: (s) => fmtDate(s.date_of_rank), xl: (s) => s.date_of_rank },
  { key: "date_joined_unit", label: "Joined Unit", sort: (s) => s.date_joined_unit, show: (s) => fmtDate(s.date_joined_unit), xl: (s) => s.date_joined_unit },
  { key: "atts", label: "Attachment", sort: (s) => s.atts_type, show: (s) => (s.atts_type ? `${s.atts_type}${s.atts_location ? " – " + s.atts_location : ""}` : "") },
  { key: "status", label: "Status", sort: (s) => s.status, show: (s) => s.status },
  { key: "nid_no", label: "NID", sort: (s) => s.nid_no, show: (s) => s.nid_no ?? "" },
  { key: "spouse_name", label: "Spouse", sort: (s) => s.spouse_name, show: (s) => s.spouse_name ?? "" },
  { key: "emergency", label: "Emergency Contact", sort: (s) => s.emergency_name, show: (s) => [s.emergency_name, s.emergency_relation, s.emergency_mobile].filter(Boolean).join(", ") },
  { key: "permanent_address", label: "Permanent Address", sort: (s) => s.permanent_address, show: (s) => s.permanent_address ?? "" },
];
