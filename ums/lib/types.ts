// Shared data types. Column names match supabase/schema.sql exactly.

export type Role = "admin" | "co" | "2ic" | "adjt" | "coy_comd" | "coy_rep" | "bn_rep" | "clk" | "soldier";
export type Category = "Offr" | "JCO" | "OR";

export interface Company {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  display_order: number;
  active: boolean;
}

export interface Soldier {
  id: string;
  snk_no: string;
  rank: string;
  category: Category;
  trade: string | null;
  name: string;
  name_bn: string | null;
  company_id: string;
  platoon: string | null;
  appointment: string | null;
  status: string;
  date_of_birth: string | null;
  date_of_enrolment: string | null;
  date_of_rank: string | null;
  date_joined_unit: string | null;
  retirement_date: string | null;
  previous_unit: string | null;
  height_in: number | null;
  weight_lbs: number | null;
  blood_group: string | null;
  medical_category: string | null;
  medical_remarks: string | null;
  religion: string | null;
  marital_status: string | null;
  date_of_marriage: string | null;
  spouse_name: string | null;
  education: string | null;
  nid_no: string | null;
  home_division: string | null;
  home_district: string | null;
  home_upazila: string | null;
  distance_from_ib_km: number | null;
  accommodation: "Snk Lines" | "Family Quarter" | "Out Living" | null;
  accommodation_details: string | null;
  permanent_address: string | null;
  present_address: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  email: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_mobile: string | null;
  atts_type: string | null;
  atts_location: string | null;
  atts_from: string | null;
  atts_to: string | null;
  photo_path: string | null;
  remarks: string | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DirectoryEntry {
  id: string;
  snk_no: string;
  rank: string;
  category: Category;
  trade: string | null;
  name: string;
  name_bn?: string | null;
  company_id: string;
  status: string;
  display_order: number;
  appointment?: string | null;
}

export interface TrainingPhoto {
  id: string;
  taken_on: string;
  caption: string | null;
  event_id: string | null;
  company_id: string | null;
  path: string;
  uploaded_by: string | null;
  created_at: string;
  url?: string | null;
}

export type RecordKind = "family" | "education" | "course" | "discipline" | "award" | "posting" | "medical" | "report" | "vehicle";

export interface SoldierRecord {
  id: string;
  soldier_id: string;
  company_id: string | null;
  kind: RecordKind;
  record_date: string | null;
  data: Record<string, string>;
  created_at?: string;
}

export interface Profile {
  id: string;
  soldier_id: string | null;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  active: boolean;
  must_change_password: boolean;
  /** staff logins: the appointment (e.g. "Training Clerk") and who is doing the duty now */
  appointment?: string | null;
  held_by?: string | null;
  held_by_soldier?: string | null;
}

export interface ProfileChangeRequest {
  id: string;
  soldier_id: string;
  company_id: string | null;
  requested_by: string | null;
  changes: Record<string, string | null>;
  old_values: Record<string, string | null>;
  record_ops: Array<{ op: "add" | "update" | "delete"; kind: RecordKind; id?: string; record_date?: string | null; data?: Record<string, string> }>;
  note: string | null;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
  created_at: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  annual_quota: number | null;
  active: boolean;
  display_order: number;
}

export type LeaveStatus = "Applied" | "Recommended" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveApplication {
  id: string;
  soldier_id: string;
  company_id: string | null;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  leave_address: string | null;
  contact_no: string | null;
  status: LeaveStatus;
  applied_by: string | null;
  applied_at: string;
  recommended_by: string | null;
  recommended_at: string | null;
  recommend_remarks: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_remarks: string | null;
  rejoin_date: string | null;
  rejoin_by: string | null;
}

export interface ParadeState {
  id: string;
  date: string;
  /** name shown, e.g. "Morning State", "2nd Parade State", "Durbar" */
  state_type: string;
  kind: "Morning" | "Second" | "Extra";
  opens_at: string | null;
  closes_at: string | null;
  display_order: number;
  status: "Open" | "Finalized";
  created_by: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface ParadeEntry {
  id: string;
  parade_state_id: string;
  soldier_id: string;
  company_id: string;
  state: "Present" | "Absent";
  absent_reason: string | null;
  employment: string | null;
  location: string | null;
  remarks: string | null;
  is_manual: boolean;
  auto_note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface CoySubmission {
  id: string;
  parade_state_id: string;
  company_id: string;
  status: "Draft" | "Submitted" | "Accepted" | "Returned";
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  remarks: string | null;
}

export interface TrainingType {
  id: string;
  code: string;
  name: string;
  frequency: number;
  sequence_label: string;
  sequence_names: string[];
  max_attempts: number;
  has_marks: boolean;
  pass_mark: number | null;
  applies_to: Category[];
  active: boolean;
  display_order: number;
  /** Recorded as Completed / Not completed (e.g. Group Training) instead of Pass / Fail. */
  completion_only?: boolean;
}

export type TrainingResult = "Pass" | "Fail" | "Exempted" | "Absent" | "Ongoing";

export interface TrainingRecord {
  id: string;
  soldier_id: string;
  company_id: string | null;
  training_type_id: string;
  year: number;
  sequence_no: number;
  attempt_no: number;
  test_date: string | null;
  result: TrainingResult;
  marks: number | null;
  grade: string | null;
  part1_no: string | null;
  remarks: string | null;
}

export interface TrainingEvent {
  id: string;
  title: string;
  event_type: string;
  training_type_id: string | null;
  company_id: string | null;
  start_date: string;
  end_date: string;
  venue: string | null;
  conducting_officer: string | null;
  description: string | null;
  status: "Planned" | "Ongoing" | "Completed" | "Cancelled";
}

export interface CourseNomination {
  id: string;
  soldier_id: string;
  company_id: string | null;
  course_name: string;
  institution: string | null;
  course_type: "Internal" | "External";
  from_date: string | null;
  to_date: string | null;
  status: "Nominated" | "Attending" | "Completed" | "Failed" | "Withdrawn";
  result: string | null;
  grade: string | null;
  part1_no: string | null;
  remarks: string | null;
}

export interface ItpItem {
  id: string;
  soldier_id: string;
  company_id: string | null;
  year: number;
  title: string;
  category: string;
  target_date: string | null;
  status: "Planned" | "In Progress" | "Completed" | "Not Achieved";
  completed_date: string | null;
  remarks: string | null;
}

export interface DailyProgramme {
  id: string;
  date: string;
  time_from: string | null;
  time_to: string | null;
  activity: string;
  venue: string | null;
  participants: string | null;
  company_id: string | null;
  responsible: string | null;
  dress: string | null;
  remarks: string | null;
  status: "Planned" | "Ongoing" | "Completed" | "Cancelled";
}

export interface DutyRosterEntry {
  id: string;
  date: string;
  duty_type: string;
  soldier_id: string;
  company_id: string | null;
  shift: string | null;
  remarks: string | null;
}

export interface SickReport {
  id: string;
  soldier_id: string;
  company_id: string | null;
  report_date: string;
  complaint: string | null;
  disposal: "Duty" | "Light Duty" | "Excused Duty" | "Admitted" | "Referred";
  days: number;
  hospital: string | null;
  discharge_date: string | null;
  remarks: string | null;
}

export interface Notice {
  id: string;
  title: string;
  body: string | null;
  category: string;
  priority: "Normal" | "Important" | "Urgent";
  company_id: string | null;
  publish_date: string;
  expiry_date: string | null;
  created_by: string | null;
  created_at: string;
  /** PDF / image files attached to the notice (v3.2) */
  attachments?: NoticeFile[] | null;
  /** officer on whose behalf it is published, e.g. "Adjt" (v3.4) */
  issued_by?: string | null;
}
export interface NoticeFile { path: string; name: string; type: string; size: number }

export interface AppSettings {
  unit: { name: string; short: string; motto?: string };
  absent_reasons: string[];
  employment_types: string[];
  duty_types: string[];
  ranks: Record<Category, string[]>;
  trades: string[];
  retirement_rules: { note?: string; svc_years_by_rank: Record<string, number>; age_limit_by_category: Record<string, number> };
  /** Automatic exemption from tests (age / medical category) */
  training_exemption: { age: number | null; med_cats: string[]; tests: string[] };
  /** opening hours of the daily parade states (Bangladesh time, "HH:MM") */
  parade_windows: { open_time: string; morning_close: string; second_close: string; extra_close: string };
  /** standard appointments of officers (Adjt, QM, Coy Comd, 2IC, CO) */
  officer_appointments: string[];
}

export interface ManagedUser {
  id: string;
  fullName: string | null;
  role: Role;
  companyId: string | null;
  soldierId: string | null;
  active: boolean;
  mustChangePassword: boolean;
  loginId: string;
  email: string;
  lastSignIn: string | null;
  appointment?: string | null;
  heldBy?: string | null;
  heldBySoldier?: string | null;
}

/** "Apply for new ID" request submitted from the login page (Adjt approves). */
export interface IdApplication {
  id: string;
  snk_no: string;
  category: Category;
  rank: string;
  name: string;
  company_id: string;
  data: Record<string, string>;
  records: Array<{ kind: string; data: Record<string, string>; record_date?: string | null }>;
  status: "Pending" | "Approved" | "Rejected";
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
  soldier_id: string | null;
  user_id: string | null;
}

export type CycleActivity = "Indl Training" | "Group Training" | "Unit Admin" | "Privilege Leave";
/** The year's 4 cycles of 3 months, planned by the Coy Comd. */
export interface CyclePlan {
  id: string;
  soldier_id: string;
  company_id: string | null;
  year: number;
  c1: CycleActivity | null;
  c2: CycleActivity | null;
  c3: CycleActivity | null;
  c4: CycleActivity | null;
  remarks: string | null;
  updated_at?: string;
}

export interface OfficerCommitment {
  id: string;
  date: string;
  time_from: string | null;
  time_to: string | null;
  soldier_id: string;
  title: string;
  venue: string | null;
  remarks: string | null;
}
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "On Hold";
export interface OfficerTask {
  id: string;
  title: string;
  details: string | null;
  category: string;
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: TaskStatus;
  deadline: string | null;
  assigned_to: string[];
  remarks: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
}
export interface AppointmentHolder {
  id: string;
  profile_id: string;
  held_by: string | null;
  held_by_soldier: string | null;
  from_at: string;
  to_at: string | null;
}
