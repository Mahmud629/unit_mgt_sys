// Data access used by every page. All permission checks are enforced by the
// database (RLS + functions); the UI only hides what a role cannot do.
import { DEFAULT_SETTINGS } from "./constants";
import { db, isDemo } from "./db";
import type {
  AppSettings, Company, CourseNomination, CoySubmission, DailyProgramme, DirectoryEntry, DutyRosterEntry, ItpItem,
  LeaveApplication, LeaveType, ManagedUser, Notice, NoticeFile, ParadeEntry, ParadeState, Profile, ProfileChangeRequest, SickReport,
  Soldier, SoldierRecord, TrainingEvent, TrainingPhoto, TrainingRecord, TrainingType, IdApplication,
  AppointmentHolder, CyclePlan, OfficerCommitment, OfficerTask,
} from "./types";
import { bdToday, errorMessage } from "./utils";

type Res<T> = { data: T | null; error: unknown };
function must<T>(r: Res<T>): T {
  if (r.error) throw new Error(errorMessage(r.error));
  return r.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

/** Fetch every row (pages through Supabase's 1000-row limit). */
export async function fetchAll<T>(table: string, build: (q: Q) => Q = (q) => q, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const r = await build(db().from(table).select("*")).range(from, from + pageSize - 1);
    const rows = must<T[]>(r);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
async function insertRow<T>(table: string, row: Partial<T>): Promise<T> {
  return must<T>(await db().from(table).insert(row as never).select().single());
}
async function updateRow<T>(table: string, id: string, patch: Partial<T>): Promise<T> {
  const r = await db().from(table).update(patch as never).eq("id", id).select();
  const rows = must<T[]>(r);
  if (!rows.length) throw new Error("You do not have permission to change this record (or it is locked).");
  return rows[0];
}
async function saveRow<T extends { id?: string }>(table: string, row: Partial<T>): Promise<T> {
  const { id, ...rest } = row as Partial<T> & { id?: string };
  return id ? updateRow<T>(table, id, rest as Partial<T>) : insertRow<T>(table, rest as Partial<T>);
}
async function deleteRow(table: string, id: string) {
  const r = await db().from(table).delete().eq("id", id).select();
  const rows = must<unknown[]>(r);
  if (!rows.length) throw new Error("You do not have permission to delete this record.");
}
async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return must<T>(await db().rpc(name, args));
}

// =============================================================== auth
export async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong Personal No or password." : error.message);
}
export async function signOut() {
  await db().auth.signOut();
}
export async function changePassword(newPassword: string) {
  const { error } = await db().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  await rpc("mark_password_changed");
}
export async function getMyProfile(): Promise<Profile | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  return must<Profile | null>(await db().from("profiles").select("*").eq("id", uid).maybeSingle());
}

// ===================================================== reference data
export async function loadCompanies(): Promise<Company[]> {
  return must<Company[]>(await db().from("companies").select("*").order("display_order"));
}
export async function saveCompany(c: Partial<Company>) {
  return saveRow<Company>("companies", c);
}
export async function loadSettings(): Promise<AppSettings> {
  const rows = must<Array<{ key: string; value: unknown }>>(await db().from("app_settings").select("*"));
  const s = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const r of rows) s[r.key] = r.value;
  return s as unknown as AppSettings;
}
export async function saveSetting(key: keyof AppSettings, value: unknown) {
  must(await db().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" }).select());
}
export async function loadLeaveTypes(): Promise<LeaveType[]> {
  return must<LeaveType[]>(await db().from("leave_types").select("*").order("display_order"));
}
export const saveLeaveType = (t: Partial<LeaveType>) => saveRow<LeaveType>("leave_types", t);
export async function loadTrainingTypes(): Promise<TrainingType[]> {
  return must<TrainingType[]>(await db().from("training_types").select("*").order("display_order"));
}
export const saveTrainingType = (t: Partial<TrainingType>) => saveRow<TrainingType>("training_types", t);

// ============================================================ soldiers
export async function loadDirectory(): Promise<DirectoryEntry[]> {
  return rpc<DirectoryEntry[]>("soldier_directory");
}
export async function listSoldiers(): Promise<Soldier[]> {
  return fetchAll<Soldier>("soldiers", (q) => q.order("display_order").order("snk_no"));
}
export async function getSoldier(id: string): Promise<Soldier | null> {
  return must<Soldier | null>(await db().from("soldiers").select("*").eq("id", id).maybeSingle());
}
export async function saveSoldier(s: Partial<Soldier>): Promise<Soldier> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (["created_at", "updated_at"].includes(k)) continue;
    clean[k] = v === "" ? null : v;
  }
  return saveRow<Soldier>("soldiers", clean as Partial<Soldier>);
}
export async function upsertSoldiers(rows: Partial<Soldier>[]) {
  const chunks: Partial<Soldier>[][] = [];
  for (let i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
  for (const c of chunks) must(await db().from("soldiers").upsert(c, { onConflict: "snk_no" }).select("id"));
}
export const deleteSoldier = (id: string) => deleteRow("soldiers", id);

export async function listRecords(soldierId: string): Promise<SoldierRecord[]> {
  return must<SoldierRecord[]>(await db().from("soldier_records").select("*").eq("soldier_id", soldierId).order("record_date", { ascending: false }));
}
export async function listAllRecords(kind?: string): Promise<SoldierRecord[]> {
  return fetchAll<SoldierRecord>("soldier_records", (q) => (kind ? q.eq("kind", kind) : q));
}
export const saveRecord = (r: Partial<SoldierRecord>) => saveRow<SoldierRecord>("soldier_records", r);
export const deleteRecord = (id: string) => deleteRow("soldier_records", id);

export async function photoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await db().storage.from("soldier-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
export async function uploadPhoto(soldierId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${soldierId}/photo-${Date.now()}.${ext}`;
  const { error } = await db().storage.from("soldier-photos").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(errorMessage(error));
  await updateRow<Soldier>("soldiers", soldierId, { photo_path: path });
  return path;
}

// ============================================== profile change requests
export async function listChangeRequests(opts: { status?: string; soldierId?: string } = {}): Promise<ProfileChangeRequest[]> {
  return fetchAll<ProfileChangeRequest>("profile_change_requests", (q) => {
    let x = q.order("created_at", { ascending: false });
    if (opts.status) x = x.eq("status", opts.status);
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    return x;
  });
}
export async function createChangeRequest(r: Pick<ProfileChangeRequest, "soldier_id" | "changes" | "old_values" | "record_ops" | "note">) {
  const uid = await currentUserId();
  return insertRow<ProfileChangeRequest>("profile_change_requests", { ...r, requested_by: uid, status: "Pending" });
}
export const reviewChangeRequest = (id: string, approve: boolean, remarks: string | null) =>
  rpc("review_profile_request", { p_id: id, p_approve: approve, p_remarks: remarks });
export const cancelChangeRequest = (id: string) => rpc("cancel_profile_request", { p_id: id });

// ============================================================== leave
export async function listLeave(opts: { soldierId?: string; status?: string[]; from?: string; to?: string } = {}): Promise<LeaveApplication[]> {
  return fetchAll<LeaveApplication>("leave_applications", (q) => {
    let x = q.order("from_date", { ascending: false });
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    if (opts.status?.length) x = x.in("status", opts.status);
    if (opts.to) x = x.lte("from_date", opts.to);
    if (opts.from) x = x.gte("to_date", opts.from);
    return x;
  });
}
export async function applyLeave(l: Partial<LeaveApplication>) {
  const uid = await currentUserId();
  return insertRow<LeaveApplication>("leave_applications", { ...l, status: "Applied", applied_by: uid });
}
export const updatePendingLeave = (id: string, patch: Partial<LeaveApplication>) => updateRow<LeaveApplication>("leave_applications", id, patch);
export const leaveAction = (id: string, action: "recommend" | "approve" | "reject" | "cancel" | "rejoin", remarks?: string | null, date?: string | null) =>
  rpc("leave_action", { p_id: id, p_action: action, p_remarks: remarks ?? null, p_date: date ?? null });

// ======================================================== parade state
export const ensureParadeState = (date: string) => rpc<string>("ensure_parade_state", { p_date: date });
/** Opens (when due) the Morning State and 2nd Parade State of a date; returns all states of that date. */
export async function ensureParadeStates(date: string): Promise<string[]> {
  const r = await rpc<unknown>("ensure_parade_states", { p_date: date });
  return (Array.isArray(r) ? r : []).map((x) => (typeof x === "string" ? x : (x as Record<string, string>).ensure_parade_states ?? (x as Record<string, string>).id));
}
export const openExtraState = (date: string, name: string, closesAt?: string | null, copyFrom?: string | null) =>
  rpc<string>("open_extra_state", { p_date: date, p_name: name, p_closes_at: closesAt ?? null, p_copy_from: copyFrom ?? null });
export const copyParadeState = (from: string, to: string, companyId?: string | null) => rpc<number>("copy_parade_state", { p_from: from, p_to: to, p_company: companyId ?? null });
export const syncParadeState = (stateId: string) => rpc("sync_parade_state", { p_state_id: stateId });
export const startSecondState = (date: string) => rpc<string>("start_second_state", { p_date: date });
export const setSubmissionStatus = (stateId: string, companyId: string, status: CoySubmission["status"], remarks?: string | null) =>
  rpc("set_submission_status", { p_state_id: stateId, p_company: companyId, p_status: status, p_remarks: remarks ?? null });
export const finalizeParadeState = (stateId: string, force = false) => rpc("finalize_parade_state", { p_state_id: stateId, p_force: force });
export const reopenParadeState = (stateId: string) => rpc("reopen_parade_state", { p_state_id: stateId });

export async function listParadeStates(from?: string, to?: string): Promise<ParadeState[]> {
  return fetchAll<ParadeState>("parade_states", (q) => {
    let x = q.order("date", { ascending: false }).order("display_order", { ascending: true });
    if (from) x = x.gte("date", from);
    if (to) x = x.lte("date", to);
    return x;
  });
}
export async function getParadeStatesForDate(date: string): Promise<ParadeState[]> {
  return must<ParadeState[]>(await db().from("parade_states").select("*").eq("date", date).order("display_order").order("created_at"));
}
export async function listParadeEntries(stateIds: string | string[]): Promise<ParadeEntry[]> {
  const ids = Array.isArray(stateIds) ? stateIds : [stateIds];
  if (!ids.length) return [];
  return fetchAll<ParadeEntry>("parade_entries", (q) => q.in("parade_state_id", ids));
}
export async function listSubmissions(stateIds: string | string[]): Promise<CoySubmission[]> {
  const ids = Array.isArray(stateIds) ? stateIds : [stateIds];
  if (!ids.length) return [];
  return must<CoySubmission[]>(await db().from("coy_submissions").select("*").in("parade_state_id", ids));
}
export async function updateParadeEntry(id: string, patch: Partial<ParadeEntry>) {
  const uid = await currentUserId();
  return updateRow<ParadeEntry>("parade_entries", id, { ...patch, is_manual: patch.is_manual ?? true, updated_by: uid });
}

// ============================================================ training
export async function listTrainingRecords(opts: { year?: number; soldierId?: string; typeId?: string } = {}): Promise<TrainingRecord[]> {
  return fetchAll<TrainingRecord>("training_records", (q) => {
    let x = q;
    if (opts.year) x = x.eq("year", opts.year);
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    if (opts.typeId) x = x.eq("training_type_id", opts.typeId);
    return x;
  });
}
export async function saveTrainingRecords(rows: Partial<TrainingRecord>[]) {
  const uid = await currentUserId();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, updated_by: uid }));
    must(await db().from("training_records").upsert(chunk, { onConflict: "soldier_id,training_type_id,year,sequence_no,attempt_no" }).select("id"));
  }
}
export const deleteTrainingRecord = (id: string) => deleteRow("training_records", id);

export async function listTrainingEvents(from?: string, to?: string): Promise<TrainingEvent[]> {
  return fetchAll<TrainingEvent>("training_events", (q) => {
    let x = q.order("start_date");
    if (to) x = x.lte("start_date", to);
    if (from) x = x.gte("end_date", from);
    return x;
  });
}
export const saveTrainingEvent = (e: Partial<TrainingEvent>) => saveRow<TrainingEvent>("training_events", e);
export const deleteTrainingEvent = (id: string) => deleteRow("training_events", id);

export async function listCourses(opts: { soldierId?: string } = {}): Promise<CourseNomination[]> {
  return fetchAll<CourseNomination>("course_nominations", (q) => {
    let x = q.order("from_date", { ascending: false });
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    return x;
  });
}
export const saveCourse = (c: Partial<CourseNomination>) => saveRow<CourseNomination>("course_nominations", c);
export const deleteCourse = (id: string) => deleteRow("course_nominations", id);

export async function listItp(opts: { year?: number; soldierId?: string } = {}): Promise<ItpItem[]> {
  return fetchAll<ItpItem>("itp_items", (q) => {
    let x = q.order("target_date");
    if (opts.year) x = x.eq("year", opts.year);
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    return x;
  });
}
export const saveItp = (i: Partial<ItpItem>) => saveRow<ItpItem>("itp_items", i);
export async function insertItpItems(items: Partial<ItpItem>[]) {
  for (let i = 0; i < items.length; i += 200) must(await db().from("itp_items").insert(items.slice(i, i + 200)).select("id"));
}
export const deleteItp = (id: string) => deleteRow("itp_items", id);

// ===================================================== daily activities
export async function listProgrammes(from: string, to: string): Promise<DailyProgramme[]> {
  return fetchAll<DailyProgramme>("daily_programmes", (q) => q.gte("date", from).lte("date", to).order("date").order("time_from"));
}
export const saveProgramme = (p: Partial<DailyProgramme>) => saveRow<DailyProgramme>("daily_programmes", p);
export const deleteProgramme = (id: string) => deleteRow("daily_programmes", id);
export async function copyProgrammes(fromDate: string, toDate: string) {
  const rows = await listProgrammes(fromDate, fromDate);
  if (!rows.length) throw new Error("Nothing to copy on the source date.");
  for (const r of rows) {
    const { id: _id, ...rest } = r;
    void _id;
    await insertRow<DailyProgramme>("daily_programmes", { ...rest, date: toDate, status: "Planned" });
  }
  return rows.length;
}

export async function listDuties(from: string, to: string): Promise<DutyRosterEntry[]> {
  return fetchAll<DutyRosterEntry>("duty_roster", (q) => q.gte("date", from).lte("date", to).order("date"));
}
export async function listMyDuties(soldierId: string, from: string): Promise<DutyRosterEntry[]> {
  return must<DutyRosterEntry[]>(await db().from("duty_roster").select("*").eq("soldier_id", soldierId).gte("date", from).order("date").limit(20));
}
export const saveDuty = (d: Partial<DutyRosterEntry>) => saveRow<DutyRosterEntry>("duty_roster", d);
export const deleteDuty = (id: string) => deleteRow("duty_roster", id);

// ============================================================= medical
export async function listSickReports(opts: { from?: string; to?: string; soldierId?: string } = {}): Promise<SickReport[]> {
  return fetchAll<SickReport>("sick_reports", (q) => {
    let x = q.order("report_date", { ascending: false });
    if (opts.from) x = x.gte("report_date", opts.from);
    if (opts.to) x = x.lte("report_date", opts.to);
    if (opts.soldierId) x = x.eq("soldier_id", opts.soldierId);
    return x;
  });
}
export async function listOpenAdmissions(): Promise<SickReport[]> {
  return fetchAll<SickReport>("sick_reports", (q) => q.eq("disposal", "Admitted").is("discharge_date", null));
}
export const saveSickReport = (r: Partial<SickReport>) => saveRow<SickReport>("sick_reports", r);
export const deleteSickReport = (id: string) => deleteRow("sick_reports", id);

// ============================================================= notices
export async function listNotices(): Promise<Notice[]> {
  return must<Notice[]>(await db().from("notices").select("*").order("publish_date", { ascending: false }).limit(200));
}
export const saveNotice = (n: Partial<Notice>) => saveRow<Notice>("notices", n);
export const deleteNotice = (id: string) => deleteRow("notices", id);

// =============================================================== users
export async function manageUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke("manage-users", { body });
  if (error) {
    // Supabase wraps non-2xx replies; try to surface the function's own message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const j = await ctx.json().catch(() => null);
      if (j?.error) throw new Error(j.error);
    }
    if (!isDemo && /Failed to send|fetch/i.test(errorMessage(error)))
      throw new Error("Could not reach the 'manage-users' Edge Function. Deploy it as described in SETUP.md.");
    throw new Error(errorMessage(error));
  }
  if (data && typeof data === "object" && "error" in (data as object)) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}
export const listUsers = async () => (await manageUsers<{ users: ManagedUser[] }>({ action: "list" })).users;

// =============================================================== audit
export async function listAudit(opts: { recordId?: string; limit?: number } = {}) {
  let q = db().from("audit_log").select("*").order("at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.recordId) q = q.eq("record_id", opts.recordId);
  return must<Array<{ id: number; at: string; actor: string | null; table_name: string; record_id: string; action: string; changes: Record<string, unknown> }>>(await q);
}
export async function listProfilesBasic() {
  return must<Array<Pick<Profile, "id" | "full_name" | "role">>>(await db().from("profiles").select("id, full_name, role"));
}
export async function getParadeState(id: string): Promise<ParadeState | null> {
  return must<ParadeState | null>(await db().from("parade_states").select("*").eq("id", id).maybeSingle());
}

// ======================================================== training photos
/** Shrinks a phone photo before upload (max side, JPEG quality). */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function photoSrc(path: string): Promise<string | null> {
  if (path.startsWith("/")) return path; // bundled demo image
  const { data } = await db().storage.from("training-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
export async function listTrainingPhotos(limit = 60): Promise<TrainingPhoto[]> {
  const rows = must<TrainingPhoto[]>(await db().from("training_photos").select("*").order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit));
  return Promise.all(rows.map(async (r) => ({ ...r, url: await photoSrc(r.path) })));
}
export async function uploadTrainingPhoto(file: File, meta: { caption: string | null; taken_on: string; company_id: string | null; event_id: string | null }) {
  const blob = await compressImage(file, isDemo ? 900 : 1600, isDemo ? 0.7 : 0.82);
  const path = `${meta.taken_on.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await db().storage.from("training-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(errorMessage(error));
  const uid = await currentUserId();
  return insertRow<TrainingPhoto>("training_photos", { ...meta, path, uploaded_by: uid });
}
// ---- notice & order attachments (PDF or image)
export const NOTICE_FILE_MAX = isDemo ? 4_500_000 : 15_000_000;
export async function uploadNoticeFile(file: File): Promise<NoticeFile> {
  const isImg = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImg && !isPdf) throw new Error(`${file.name}: only PDF or image files can be attached`);
  const body: Blob = isImg ? await compressImage(file, 1800, 0.85) : file;
  if (body.size > NOTICE_FILE_MAX) throw new Error(`${file.name} is too large (max ${Math.round(NOTICE_FILE_MAX / 1_000_000)} MB)`);
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
  const name = isImg ? safe.replace(/\.[^.]+$/, "") + ".jpg" : safe;
  const path = `${bdToday().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name}`;
  const type = isImg ? "image/jpeg" : "application/pdf";
  const { error } = await db().storage.from("notice-files").upload(path, body, { contentType: type });
  if (error) throw new Error(errorMessage(error));
  return { path, name: isImg ? file.name.replace(/\.[^.]+$/, ".jpg") : file.name, type, size: body.size };
}
export async function noticeFileUrl(path: string): Promise<string | null> {
  const { data } = await db().storage.from("notice-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
/** Opens an attachment in a new tab (works for the demo's stored files too). */
export async function openNoticeFile(f: NoticeFile, download = false) {
  const url = await noticeFileUrl(f.path);
  if (!url) throw new Error("File not found");
  const blob = await (await fetch(url)).blob();
  const obj = URL.createObjectURL(new Blob([blob], { type: f.type }));
  const a = document.createElement("a");
  a.href = obj;
  if (download) a.download = f.name; else a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 60_000);
}
export async function removeNoticeFiles(paths: string[]) {
  if (paths.length) await db().storage.from("notice-files").remove(paths);
}
export async function deleteTrainingPhoto(p: TrainingPhoto) {
  await deleteRow("training_photos", p.id);
  if (!p.path.startsWith("/")) await db().storage.from("training-photos").remove([p.path]);
}

// ====================================================== v2.1: new ID & profile
export interface RegistrationOptions {
  companies: Array<{ id: string; name: string; short_name: string }>;
  ranks: AppSettings["ranks"] | null;
  trades: string[] | null;
  unit: AppSettings["unit"] | null;
}
/** Companies, ranks and trades for the "Apply for new ID" page (works before sign-in). */
export async function registrationOptions(): Promise<RegistrationOptions> {
  const o = await rpc<RegistrationOptions>("registration_options");
  return {
    companies: o?.companies ?? [],
    ranks: o?.ranks ?? DEFAULT_SETTINGS.ranks,
    trades: o?.trades ?? DEFAULT_SETTINGS.trades,
    unit: o?.unit ?? DEFAULT_SETTINGS.unit,
  };
}
export const submitIdApplication = (p: Record<string, unknown>, password: string) => rpc<string>("submit_id_application", { p, p_password: password });
export async function idApplicationStatus(personalNo: string): Promise<{ status: string; submitted_at: string; review_remarks: string | null } | null> {
  const rows = await rpc<Array<{ status: string; submitted_at: string; review_remarks: string | null }>>("id_application_status", { p_snk: personalNo });
  return rows?.[0] ?? null;
}
export async function listIdApplications(status?: IdApplication["status"]): Promise<IdApplication[]> {
  return fetchAll<IdApplication>("id_applications", (q) => (status ? q.eq("status", status) : q).order("submitted_at", { ascending: false }));
}
export const approveIdApplication = (id: string, companyId: string, remarks?: string | null) =>
  manageUsers<{ ok: boolean; soldierId: string; loginId: string }>({ action: "approve_application", applicationId: id, companyId, remarks: remarks ?? null });
export const rejectIdApplication = (id: string, remarks: string | null) => rpc("reject_id_application", { p_id: id, p_remarks: remarks });
/** First login: fills only the EMPTY fields of the signed-in soldier's own file. */
export const completeMyProfile = (fields: Record<string, unknown>, records: Array<{ kind: string; data: Record<string, unknown>; record_date?: string | null }>) =>
  rpc<number>("complete_my_profile", { p_fields: fields, p_records: records });

// ====================================================== v3.0
export async function listCyclePlans(year: number, soldierId?: string): Promise<CyclePlan[]> {
  return fetchAll<CyclePlan>("cycle_plans", (q) => { let x = q.eq("year", year); if (soldierId) x = x.eq("soldier_id", soldierId); return x; });
}
/** Saves one or many soldiers' cycle plans for a year (insert or update by soldier + year). */
export async function saveCyclePlans(rows: Array<Partial<CyclePlan> & { soldier_id: string; year: number }>) {
  if (!rows.length) return;
  must(await db().from("cycle_plans").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })) as never, { onConflict: "soldier_id,year" }).select());
}
export async function listCommitments(from: string, to: string): Promise<OfficerCommitment[]> {
  return fetchAll<OfficerCommitment>("officer_commitments", (q) => q.gte("date", from).lte("date", to).order("date").order("time_from"));
}
export const saveCommitment = (c: Partial<OfficerCommitment>) => saveRow<OfficerCommitment>("officer_commitments", c);
export const deleteCommitment = (id: string) => deleteRow("officer_commitments", id);
export async function listOfficerTasks(): Promise<OfficerTask[]> {
  return fetchAll<OfficerTask>("officer_tasks", (q) => q.order("deadline", { ascending: true, nullsFirst: false }).order("created_at"));
}
export const saveOfficerTask = (t: Partial<OfficerTask>) => saveRow<OfficerTask>("officer_tasks", t);
export const deleteOfficerTask = (id: string) => deleteRow("officer_tasks", id);
export async function listAppointmentHolders(profileId: string): Promise<AppointmentHolder[]> {
  return fetchAll<AppointmentHolder>("appointment_holders", (q) => q.eq("profile_id", profileId).order("from_at", { ascending: false }));
}
/** Re-creates a deleted row (used by Undo). */
const GENERATED: Record<string, string[]> = { leave_applications: ["days"] };
export async function restoreRow(table: string, row: object) {
  const clean: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of GENERATED[table] ?? []) delete clean[k];
  must(await db().from(table).insert(clean as never).select());
}
