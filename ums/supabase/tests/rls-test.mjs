// Automated checks for supabase/schema.sql. Usage: npm install && npm test
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const schema = fs.readFileSync(process.argv[2], "utf8").replace("create extension if not exists pgcrypto;", "");
process.on("unhandledRejection", e => { console.log("ERROR:", e.message, e.where ?? "", e.position ?? ""); process.exit(1); });
const db = new PGlite();

const preamble = `
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant usage on schema auth to anon;
grant execute on function auth.uid() to anon;
-- Supabase keeps pgcrypto in the "extensions" schema; PGlite has no pgcrypto, so stub it.
create schema extensions;
create function extensions.gen_salt(text, integer) returns text language sql as $$ select '$2a$' || $2 || '$stub' $$;
create function extensions.crypt(text, text) returns text language sql as $$ select $2 || md5($1) $$;
`;
await db.exec(preamble);
await db.exec(schema);
await db.exec(schema); // re-run safety
await db.exec(`grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant usage on schema public to anon;
grant select on all tables in schema public to anon;`);
console.log("schema applied twice OK");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗ FAIL:", msg); } };
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function asAnon(sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function expectAnonError(sql, params, msg) {
  try { await asAnon(sql, params); ok(false, msg + " (expected error)"); }
  catch (e) { ok(true, msg + " → " + e.message.slice(0, 90)); }
}
async function expectError(uid, sql, params, msg) {
  try { await as(uid, sql, params); ok(false, msg + " (expected error)"); }
  catch (e) { ok(true, msg + " → " + e.message.slice(0, 90)); }
}
const q = (sql, p) => db.query(sql, p);

const coy = Object.fromEntries((await q("select slug, id from companies")).rows.map(r => [r.slug, r.id]));
ok(Object.keys(coy).length === 10 && coy["121-bsc"] && coy.eme, "10 standard companies seeded (incl. 121 BSC, EME Sec)");

// Soldiers
const mk = async (snk, rank, cat, name, slug, extra = {}) => {
  const r = await q(`insert into soldiers (snk_no, rank, category, name, company_id, date_of_birth, date_of_enrolment, home_district, height_in)
    values ($1,$2,$3,$4,$5,'1995-05-01','2014-01-10','Bogura',66) returning id`, [snk, rank, cat, name, coy[slug]]);
  return r.rows[0].id;
};
const sA = await mk("4001", "Sig", "OR", "Rahim", "rdo");
const sB = await mk("4002", "Cpl", "OR", "Karim", "rdo");
const sC = await mk("4003", "Sgt", "OR", "Jamal", "op");
const sAdjt = await mk("BA 9001", "Capt", "Offr", "Adjt Name", "bhq");
const sComd = await mk("BA 9002", "Maj", "Offr", "Coy Comd", "rdo");

// Users
const users = {};
async function user(key, role, slug, soldierId) {
  const id = crypto.randomUUID();
  await q("insert into auth.users (id, email) values ($1, $2)", [id, key + "@5sigbn.local"]);
  const p = (await q("select role, active from profiles where id=$1", [id])).rows[0];
  if (key === "admin") ok(p && p.role === "soldier" && p.active === false, "new auth user gets inactive soldier profile");
  await q("update profiles set role=$2, company_id=$3, soldier_id=$4, active=true where id=$1", [id, role, slug ? coy[slug] : null, soldierId ?? null]);
  users[key] = id;
}
await user("admin", "admin", null, null);
await user("adjt", "adjt", null, sAdjt);
await user("comd", "coy_comd", "rdo", sComd);
await user("rep", "coy_rep", "rdo", null);
await user("clk", "clk", null, null);
await user("solA", "soldier", "rdo", sA);
await user("co", "co", null, null);
await user("solB", "soldier", "rdo", sB);

console.log("\nVisibility");
ok((await as(users.rep, "select * from soldiers")).rows.length === 3, "Rdo Coy Rep sees only Rdo soldiers (3)");
ok((await as(users.adjt, "select * from soldiers")).rows.length === 5, "Adjt sees all 5");
ok((await as(users.clk, "select * from soldiers")).rows.length === 5, "Clerk sees all 5 (whole unit)");
ok((await as(users.clk, "update soldiers set mobile='222' where id=$1 returning id", [sC])).rows.length === 1, "Clerk edits personal info in any coy");
ok((await as(users.comd, "select * from soldiers")).rows.length === 3, "Coy Comd sees only his coy");
ok((await as(users.rep, "update soldiers set status='Transferred Out' where id=$1 returning id", [sB])).rows.length === 1, "Coy Rep can remove (struck off) own coy soldier");
await q("update soldiers set status='Serving' where id=$1", [sB]);
ok((await as(users.solA, "select * from soldiers")).rows.length === 1, "Soldier sees only himself");
ok((await as(users.solA, "select * from soldier_directory()")).rows.length === 5, "Soldier can use the name directory");
const upd = await as(users.solA, "update soldiers set mobile='999' where id=$1 returning id", [sA]);
ok(upd.rows.length === 0, "Soldier cannot edit his record directly");
const upd2 = await as(users.rep, "update soldiers set mobile='111' where id=$1 returning id", [sC]);
ok(upd2.rows.length === 0, "Rdo Rep cannot edit an Op Coy soldier");
await expectError(users.rep, "insert into soldiers (snk_no, rank, category, name, company_id) values ('x1','Sig','OR','X',$1)", [coy.op], "Rdo Rep cannot add soldier to Op Coy");

console.log("\nLeave workflow");
const al = (await q("select id from leave_types where code='PL'")).rows[0].id;
const today = (await q("select bd_today() as d")).rows[0].d;
const lv = (await as(users.solA, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, reason, applied_by)
  values ($1,$2,bd_today()-1,bd_today()+9,'Family',$3) returning id, days, company_id`, [sA, al, users.solA])).rows[0];
ok(lv.days === 11 && lv.company_id === coy.rdo, "Soldier applies own leave; days=11, coy auto-set");
await expectError(users.solA, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, applied_by) values ($1,$2,bd_today(),bd_today(),$3)`, [sB, al, users.solA], "Soldier cannot apply for another soldier");
await expectError(users.solA, `select leave_action($1,'approve')`, [lv.id], "Soldier cannot approve");
await expectError(users.rep, `select leave_action($1,'approve')`, [lv.id], "Coy Rep cannot approve leave");
await expectError(users.clk, `select leave_action($1,'approve')`, [lv.id], "Clerk cannot approve leave");
await as(users.comd, `select leave_action($1,'approve','Approved')`, [lv.id]);
ok((await q("select status from leave_applications where id=$1", [lv.id])).rows[0].status === "Approved", "Coy Comd approves his soldier's leave (single step)");
const lvComd = (await as(users.comd, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, applied_by) values ($1,$2,bd_today()+40,bd_today()+45,$3) returning id`, [sComd, al, users.comd])).rows[0].id;
await expectError(users.comd, `select leave_action($1,'approve')`, [lvComd], "Coy Comd cannot approve his own leave");
await as(users.co, `select leave_action($1,'approve')`, [lvComd]);
ok((await q("select status from leave_applications where id=$1", [lvComd])).rows[0].status === "Approved", "CO approves Coy Comd's leave");
await expectError(users.rep, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, applied_by) values ($1,$2,bd_today()+2,bd_today()+3,$3)`, [sA, al, users.rep], "Overlapping leave is rejected");

// Course + hospital + duty to drive parade state
await q(`insert into course_nominations (soldier_id, course_name, institution, course_type, from_date, to_date, status) values ($1,'Basic Rdo Course','SST&S','External',bd_today()-5,bd_today()+20,'Attending')`, [sB]);
await q(`insert into duty_roster (date, duty_type, soldier_id) values (bd_today(),'Guard Comd',$1)`, [sC]);
await q(`insert into sick_reports (soldier_id, report_date, disposal, hospital) values ($1,bd_today()-1,'Admitted','CMH Bogura')`, [sComd]);

console.log("\nParade state");
// tests run at any hour: keep the daily states open all day (opening hours are tested separately below)
await q(`update app_settings set value='{"open_time":"00:00","morning_close":"23:59","second_close":"23:59","extra_close":"23:59"}' where key='parade_windows'`);
await expectError(users.solA, "select ensure_parade_state(bd_today())", [], "Soldier cannot open parade state");
const stateId = (await as(users.rep, "select ensure_parade_state(bd_today()) as id")).rows[0].id;
const entries = (await q("select e.*, s.snk_no from parade_entries e join soldiers s on s.id=e.soldier_id where parade_state_id=$1", [stateId])).rows;
const bySnk = Object.fromEntries(entries.map(e => [e.snk_no, e]));
ok(entries.length === 5, "Entries created for all 5 serving soldiers");
ok(bySnk["4001"].state === "Absent" && bySnk["4001"].absent_reason === "Leave", "Soldier on approved leave auto-marked Absent/Leave");
ok(bySnk["4002"].absent_reason === "Course" && bySnk["4002"].location === "SST&S", "Soldier on external course → Absent/Course");
ok(bySnk["4003"].state === "Present" && bySnk["4003"].employment === "Guard Comd", "Soldier on duty roster → Present/Employed");
ok(bySnk["BA 9002"].absent_reason === "Hospital", "Admitted soldier → Absent/Hospital");
ok(bySnk["BA 9001"].state === "Present" && bySnk["BA 9001"].employment === null, "Others → On Parade");
ok((await q("select count(*)::int c from coy_submissions where parade_state_id=$1", [stateId])).rows[0].c === 10, "Coy submissions created for all 10 coys");

const r1 = await as(users.rep, "update parade_entries set employment='Office', is_manual=true where parade_state_id=$1 and soldier_id=$2 returning id", [stateId, sC]);
ok(r1.rows.length === 0, "Rdo Rep cannot edit Op Coy entry");
const r2 = await as(users.rep, "update parade_entries set state='Absent', absent_reason='AWOL', is_manual=true where parade_state_id=$1 and soldier_id=$2 returning employment", [stateId, sB]);
ok(r2.rows.length === 1, "Rdo Rep edits own coy entry");
ok((await as(users.clk, "update parade_entries set remarks='x' where parade_state_id=$1 and soldier_id=$2 returning id", [stateId, sB])).rows.length === 0, "Clerk cannot edit parade state");
await as(users.adjt, "select sync_parade_state($1)", [stateId]);
ok((await q("select absent_reason from parade_entries where parade_state_id=$1 and soldier_id=$2", [stateId, sB])).rows[0].absent_reason === "AWOL", "Manual edit survives auto-sync");

await as(users.rep, "select set_submission_status($1,$2,'Submitted')", [stateId, coy.rdo]);
const r3 = await as(users.rep, "update parade_entries set remarks='x' where parade_state_id=$1 and soldier_id=$2 returning id", [stateId, sB]);
ok(r3.rows.length === 0, "After submitting, Coy Rep can no longer edit");
await expectError(users.rep, "select set_submission_status($1,$2,'Accepted')", [stateId, coy.rdo], "Coy Rep cannot accept");
await expectError(users.adjt, "select finalize_parade_state($1)", [stateId], "Finalize blocked while coys pending");
await as(users.adjt, "select finalize_parade_state($1, true)", [stateId]);
ok((await q("select status from parade_states where id=$1", [stateId])).rows[0].status === "Finalized", "Adjt force-finalizes");
const r4 = await as(users.adjt, "update parade_entries set remarks='late' where parade_state_id=$1 returning id", [stateId]);
ok(r4.rows.length === 0, "Finalized state is locked");
const s2 = (await q("select id from parade_states where date=bd_today() and kind='Second'")).rows[0]?.id;
ok(!!s2 && (await q("select count(*)::int c from parade_states where date=bd_today()")).rows[0].c === 2, "Morning State and 2nd Parade State both open every day");
await as(users.adjt, "select copy_parade_state($1,$2)", [stateId, s2]);
ok((await q("select count(*)::int c from parade_entries where parade_state_id=$1", [s2])).rows[0].c === 5, "2nd Parade State has every soldier");
ok((await q("select absent_reason from parade_entries where parade_state_id=$1 and soldier_id=$2", [s2, sB])).rows[0].absent_reason === "AWOL", "Copy from Morning State keeps the manual lines");

console.log("\nRejoin updates parade state");
await as(users.rep, "select leave_action($1,'rejoin',null,bd_today())", [lv.id]);
await as(users.rep, "select sync_parade_state($1)", [s2]);
ok((await q("select state from parade_entries where parade_state_id=$1 and soldier_id=$2", [s2, sA])).rows[0].state === "Present", "After rejoin, soldier shows Present");

console.log("\nProfile change requests");
const req = (await as(users.solA, `insert into profile_change_requests (soldier_id, requested_by, changes, old_values, record_ops)
  values ($1,$2,'{"mobile":"01711000000","snk_no":"9999","status":"Retired","date_of_marriage":"2020-02-02"}','{}',
  '[{"op":"add","kind":"family","data":{"name":"Ayesha","relation":"Wife"}},{"op":"add","kind":"discipline","data":{"offence":"x"}}]') returning id`, [sA, users.solA])).rows[0].id;
await expectError(users.solA, "select review_profile_request($1,true)", [req], "Soldier cannot approve own request");
await expectError(users.rep, "select review_profile_request($1,true)", [req], "Coy Rep cannot approve profile update");
await expectError(users.clk, "select review_profile_request($1,true)", [req], "Clerk cannot approve profile update");
await as(users.comd, "select review_profile_request($1,true,'ok')", [req]);
const sa = (await q("select mobile, snk_no, status, date_of_marriage from soldiers where id=$1", [sA])).rows[0];
ok(sa.mobile === "01711000000", "Approved mobile applied");
ok(sa.snk_no === "4001" && sa.status === "Serving", "Personal No / status changes ignored (office-only)");
ok(String(sa.date_of_marriage).includes("2020") || sa.date_of_marriage instanceof Date, "Date field cast correctly");
const recs = (await q("select kind from soldier_records where soldier_id=$1", [sA])).rows.map(r => r.kind);
ok(recs.includes("family") && recs.includes("discipline"), "Full info (v3.4): family and discipline records applied after approval");
{
  // v3.4: an individual can request any record kind / attachment fields; unknown kinds stay ignored
  const r2 = (await as(users.solA, `insert into profile_change_requests (soldier_id, requested_by, changes, old_values, record_ops)
    values ($1,$2,'{"atts_location":"Sig Centre","remarks":"x"}','{}','[{"op":"add","kind":"bogus","data":{}}]') returning id`, [sA, users.solA])).rows[0].id;
  await as(users.comd, "select review_profile_request($1,true)", [r2]);
  const s2 = (await q("select atts_location from soldiers where id=$1", [sA])).rows[0];
  const k2 = (await q("select count(*)::int n from soldier_records where soldier_id=$1 and kind='bogus'", [sA])).rows[0].n;
  ok(s2.atts_location === "Sig Centre" && k2 === 0, "Full info: attachment field applied, unknown record kind ignored");
}

console.log("\nCompany move & audit");
await as(users.adjt, "update soldiers set company_id=$2 where id=$1", [sA, coy.op]);
ok((await q("select company_id from leave_applications where id=$1", [lv.id])).rows[0].company_id === coy.op, "Moving soldier carries leave to new coy");
ok((await q("select company_id from profiles where id=$1", [users.solA])).rows[0].company_id === coy.op, "Soldier's account follows the move");
ok((await q("select count(*)::int c from audit_log where table_name='soldiers'")).rows[0].c > 0, "Audit log recorded");
ok((await as(users.rep, "select * from audit_log")).rows.length === 0, "Coy Rep cannot read audit log");

console.log("\nTraining & notices");
const ipft = (await q("select id from training_types where code='IPFT'")).rows[0].id;
await as(users.rep, "insert into training_records (soldier_id, training_type_id, year, sequence_no, test_date, result) values ($1,$2,2026,1,bd_today(),'Pass')", [sB, ipft]);
await expectError(users.rep, "insert into training_records (soldier_id, training_type_id, year, sequence_no, test_date, result) values ($1,$2,2026,1,bd_today(),'Pass')", [sC, ipft], "Rdo Rep cannot enter Op Coy training");
await as(users.adjt, "insert into notices (title) values ('Unit notice')");
await expectError(users.rep, "insert into notices (title) values ('x')", [], "Coy Rep cannot publish notices");
ok((await as(users.solA, "select * from notices")).rows.length === 1, "Soldier reads unit notices");
await as(users.comd, "insert into notices (title, company_id) values ('Rdo notice', $1)", [coy.rdo]);
await expectError(users.comd, "insert into notices (title) values ('unit-wide')", [], "Coy Comd cannot publish unit-wide notice");
await as(users.comd, "insert into daily_programmes (date, activity, company_id) values (bd_today(), 'Coy PT', $1)", [coy.rdo]);
await expectError(users.rep, "insert into daily_programmes (date, activity, company_id) values (bd_today(), 'x', $1)", [coy.rdo], "Coy Rep cannot change programme");
// v3.4: the Clerk enters daily commitments, the training calendar and notices on behalf of officers
await as(users.clk, "insert into daily_programmes (date, activity) values (bd_today(), 'Unit PT')");
await as(users.clk, "insert into daily_programmes (date, activity, company_id) values (bd_today(), 'Coy PT', $1)", [coy.rdo]);
await as(users.clk, "insert into training_events (title, start_date, end_date) values ('Range', bd_today(), bd_today())");
await as(users.clk, "insert into notices (title, issued_by) values ('Order', 'Adjt')");
ok((await as(users.solA, "select issued_by from notices where title='Order'")).rows[0]?.issued_by === "Adjt", "Clerk publishes programme, calendar and notices on behalf of officers");
await expectError(users.rep, "insert into training_events (title, start_date, end_date) values ('x', bd_today(), bd_today())", [], "Coy Rep cannot change the training calendar");
const tt = (await q("select code, sequence_names from training_types order by display_order")).rows;
ok(tt.length === 4 && tt[0].sequence_names[0] === "1st Bi-Annual" && tt.some(t => t.code === "GT") && !tt.some(t => t.code === "SWIM"), "IPFT 1st/2nd Bi-Annual and Group Training seeded; no Swimming");
await as(users.comd, "insert into training_photos (path, caption, company_id) values ('x/1.jpg','PT', $1)", [coy.rdo]);
await expectError(users.rep, "insert into training_photos (path, company_id) values ('x/3.jpg', $1)", [coy.rdo], "Coy Rep cannot upload training photos (officers only)");
await expectError(users.solA, "insert into training_photos (path) values ('x/2.jpg')", [], "Soldier cannot upload training photos");
ok((await as(users.solB, "select * from training_photos")).rows.length === 0 && (await as(users.rep, "select * from training_photos")).rows.length === 0, "Soldiers and Coy Rep do not see training photos");
ok((await as(users.comd, "select * from training_photos")).rows.length === 1 && (await as(users.adjt, "select * from training_photos")).rows.length === 1, "Officers (Coy Comd, Adjt) see training photos");
await as(users.solA, "select mark_password_changed()");
ok((await q("select must_change_password from profiles where id=$1", [users.solA])).rows[0].must_change_password === false, "Password-changed flag cleared");

console.log("\nv2.1 — training, ranks, profile");
ok((await q("select completion_only from training_types where code='GT'")).rows[0].completion_only === true, "Group Training is Completed / Not completed");
ok(!JSON.stringify((await q("select value from app_settings where key='ranks'")).rows[0].value).includes("2Lt"), "2Lt removed from rank list");
await expectError(users.adjt, "insert into soldiers (snk_no, rank, category, name, company_id) values ('40 01','Sig','OR','Dup',$1)", [coy.rdo], "Personal No unique ignoring spaces/case");
await expectError(users.adjt, "insert into soldiers (snk_no, rank, category, name, company_id) values ('ba9001','Sig','OR','Dup',$1)", [coy.rdo], "Personal No unique ignoring case (ba9001 = BA 9001)");
const pcr2 = (await as(users.solB, `insert into profile_change_requests (soldier_id, changes, requested_by) values ($1, '{"rank":"Sgt","distance_from_ib_km":"35","home_upazila":"Sherpur"}', $2) returning id`, [sB, users.solB])).rows[0].id;
await as(users.comd, "select review_profile_request($1, true, 'ok')", [pcr2]);
const sb = (await q("select rank, distance_from_ib_km::float d, home_upazila from soldiers where id=$1", [sB])).rows[0];
ok(sb.rank === "Sgt" && sb.d === 35 && sb.home_upazila === "Sherpur", "Soldier can request ANY personal info (rank, distance from IB) → applied on Coy Comd approval");
await q("update soldiers set nid_no=null, blood_group='B+' where id=$1", [sB]);
const n = (await as(users.solB, `select complete_my_profile('{"nid_no":"1990123","blood_group":"O-","snk_no":"X"}', '[{"kind":"education","data":{"exam":"SSC"}},{"kind":"discipline","data":{}}]') as n`)).rows[0].n;
const sb2 = (await q("select nid_no, blood_group, snk_no from soldiers where id=$1", [sB])).rows[0];
ok(n === 2 && sb2.nid_no === "1990123" && sb2.blood_group === "B+" && sb2.snk_no === "4002", "First-login completion fills only EMPTY fields (no overwrite, no Personal No change), adds education only");
await expectError(users.rep, "select complete_my_profile('{}')", [], "Staff login without soldier record cannot use profile completion");

console.log("\nv2.1 — Apply for new ID");
const opts = (await asAnon("select registration_options() as o")).rows[0].o;
ok(opts.companies.length === 10 && opts.ranks.OR.includes("Snk"), "Login page (not signed in) gets companies and ranks");
ok((await asAnon("select * from companies")).rows.length === 0, "Not signed in: cannot read tables directly");
const app = (p) => JSON.stringify({ snk_no: "4100", category: "OR", rank: "Sig", name: "New Soldier", company_id: coy.rdo, mobile: "01700", home_district: "Bogura", distance_from_ib_km: "80", snk_noX: "ignored", records: [{ kind: "family", data: { name: "Father", relation: "Father" } }], ...p });
await expectAnonError("select submit_id_application($1::jsonb, 'secret123')", [app({ snk_no: "ba 9001" })], "Cannot apply with a Personal No already in the unit");
await expectAnonError("select submit_id_application($1::jsonb, 'short')", [app({})], "Password must be 8+ characters");
const appId = (await asAnon("select submit_id_application($1::jsonb, 'secret123') as id", [app({})])).rows[0].id;
ok(!!appId, "Anyone can apply for a new ID from the login page");
await expectAnonError("select submit_id_application($1::jsonb, 'secret123')", [app({ snk_no: "41 00" })], "Second application for the same Personal No refused while pending");
const row = (await q("select data, records, status from id_applications where id=$1", [appId])).rows[0];
ok(row.status === "Pending" && row.data.mobile === "01700" && !("snk_noX" in row.data) && row.records.length === 1, "Application stores only known personal-info fields");
ok((await q("select password_hash from id_application_secrets where application_id=$1", [appId])).rows[0].password_hash !== "secret123", "Password stored only as a hash");
ok((await as(users.adjt, "select * from id_applications")).rows.length === 1, "Adjt sees the application");
ok((await as(users.adjt, "select * from id_application_secrets")).rows.length === 0, "Nobody can read password hashes from the app (server only)");
ok((await as(users.comd, "select * from id_applications")).rows.length === 1 && (await as(users.rep, "select * from id_applications")).rows.length === 0, "Coy Comd of that coy can view it; Coy Rep cannot");
await expectError(users.comd, "select reject_id_application($1, 'no')", [appId], "Coy Comd cannot decide ID applications (Adjt only)");
ok((await asAnon("select * from id_application_status('4100')")).rows[0].status === "Pending", "Applicant can check status: Pending");
await as(users.adjt, "select reject_id_application($1, 'Wrong coy')", [appId]);
const st = (await asAnon("select * from id_application_status('4100')")).rows[0];
ok(st.status === "Rejected" && st.review_remarks === "Wrong coy", "Applicant sees Rejected with the Adjt's remarks");
ok((await asAnon("select submit_id_application($1::jsonb, 'secret123') as id", [app({})])).rows[0].id, "Can apply again after rejection");

console.log("\nv2.2 — Bn Rep (BSM / Bn Daily) and duty roster");
await user("bn", "bn_rep", null, null);
ok((await as(users.bn, "select * from soldiers")).rows.length >= 5, "Bn Rep sees soldiers of every coy");
ok((await as(users.bn, "update soldiers set mobile='1' where id=$1 returning id", [sC])).rows.length === 0, "Bn Rep cannot edit personal files");
const st3 = (await as(users.bn, "select ensure_parade_state(bd_today()+1) as id")).rows[0].id;
ok(!!st3, "Bn Rep opens the parade state");
ok((await as(users.bn, "update parade_entries set employment='Guard', is_manual=true where parade_state_id=$1 and soldier_id=$2 returning id", [st3, sC])).rows.length === 1, "Bn Rep edits Op Coy lines");
ok((await as(users.bn, "update parade_entries set employment='Office', is_manual=true where parade_state_id=$1 and soldier_id=$2 returning id", [st3, sB])).rows.length === 1, "Bn Rep edits Rdo Coy lines");
await as(users.rep, "select set_submission_status($1,$2,'Submitted')", [st3, coy.rdo]);
ok((await as(users.rep, "update parade_entries set remarks='x' where parade_state_id=$1 and soldier_id=$2 returning id", [st3, sB])).rows.length === 0, "Coy Rep locked after submitting");
ok((await as(users.bn, "update parade_entries set remarks='checked' where parade_state_id=$1 and soldier_id=$2 returning id", [st3, sB])).rows.length === 1, "Bn Rep can still correct a submitted coy");
await as(users.bn, "select set_submission_status($1,$2,'Accepted')", [st3, coy.rdo]);
ok((await q("select status from coy_submissions where parade_state_id=$1 and company_id=$2", [st3, coy.rdo])).rows[0].status === "Accepted", "Bn Rep accepts a coy state");
await as(users.bn, "select set_submission_status($1,$2,'Submitted')", [st3, coy.op]);
await expectError(users.bn, "select finalize_parade_state($1, true)", [st3], "Bn Rep cannot finalize (Adjt signs off)");
await expectError(users.clk, "select set_submission_status($1,$2,'Accepted')", [st3, coy.op], "Clerk cannot accept coy states");
await as(users.bn, "insert into duty_roster (date, duty_type, soldier_id) values (bd_today()+1,'Duty NCO',$1)", [sC]);
await as(users.rep, "insert into duty_roster (date, duty_type, soldier_id) values (bd_today()+1,'Sentry',$1)", [sB]);
ok((await q("select count(*)::int c from duty_roster where date = bd_today()+1")).rows[0].c === 2, "Duty roster updated by Bn Rep (any coy) and Coy Rep (own coy)");
await expectError(users.rep, "insert into duty_roster (date, duty_type, soldier_id) values (bd_today()+1,'Sentry',$1)", [sC], "Coy Rep cannot detail another coy's soldier");
await expectError(users.clk, "insert into duty_roster (date, duty_type, soldier_id) values (bd_today()+1,'Sentry',$1)", [sC], "Clerk cannot change the duty roster");
await expectError(users.bn, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, applied_by) values ($1,$2,bd_today()+60,bd_today()+62,$3)`, [sC, al, users.bn], "Bn Rep does not apply leave for others");
ok(JSON.stringify((await q("select value from app_settings where key='training_exemption'")).rows[0].value).includes('"age": 45') || (await q("select value->>'age' a from app_settings where key='training_exemption'")).rows[0].a === "45", "Default exemption rule: age 45+, Med Cat B/C/D");

console.log("\nv3.0 — parade state opening hours and extra states");
await q(`update app_settings set value='{"open_time":"18:00","morning_close":"03:00","second_close":"15:00","extra_close":"23:59"}' where key='parade_windows'`);
const win = (await q("select to_char(opens_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI') o, to_char(closes_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI') c from parade_window('2026-10-24','Morning')")).rows[0];
ok(win.o === "2026-10-23 18:00" && win.c === "2026-10-24 03:00", "24 Oct state opens 1800 hrs 23 Oct and closes 0300 hrs 24 Oct");
const late = (await as(users.adjt, "select * from ensure_parade_states(bd_today()-3) as id")).rows;
ok(late.length === 2, "Adjt can open a past date late (both states)");
await expectError(users.rep, "select open_extra_state(bd_today(), 'Durbar')", [], "Coy Rep cannot open an extra state");
const durbar = (await as(users.bn, "select open_extra_state(bd_today(), 'Durbar') as id")).rows[0].id;
ok(!!durbar, "Bn Rep opens an extra state (Durbar)");
await expectError(users.adjt, "select open_extra_state(bd_today(), 'durbar')", [], "Two states with the same name refused");
ok((await q("select count(*)::int c from parade_entries where parade_state_id=$1", [durbar])).rows[0].c > 0, "Extra state is filled automatically");
await q("update parade_states set opens_at = now() + interval '1 hour' where id=$1", [durbar]);
ok((await as(users.rep, "update parade_entries set remarks='x' where parade_state_id=$1 and company_id=$2 returning id", [durbar, coy.rdo])).rows.length === 0, "Coy Rep cannot edit before the state opens");
ok((await as(users.bn, "update parade_entries set remarks='x' where parade_state_id=$1 and company_id=$2 returning id", [durbar, coy.rdo])).rows.length > 0, "Bn Rep can prepare it early");
await q("update parade_states set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute' where id=$1", [durbar]);
await as(users.rep, "select * from ensure_parade_states(bd_today())");
ok((await q("select status from parade_states where id=$1", [durbar])).rows[0].status === "Finalized", "State finalizes itself at its closing time");
ok((await q("select count(*)::int c from coy_submissions where parade_state_id=$1 and status<>'Accepted'", [durbar])).rows[0].c === 0, "All coys marked accepted at closing time");
await as(users.adjt, "select reopen_parade_state($1)", [durbar]);
const re = (await q("select status, closes_at > now() + interval '100 minutes' ok from parade_states where id=$1", [durbar])).rows[0];
ok(re.status === "Open" && re.ok, "Reopened state gets 2 more hours");

console.log("\nv3.0 — appointment logins and leave");
const tc = crypto.randomUUID();
await q("insert into auth.users (id, email) values ($1,'trg-clk@5sigbn.local')", [tc]);
await q("update profiles set role='clk', active=true, appointment='Training Clerk', held_by='Cpl Rahim' where id=$1", [tc]);
await q("update profiles set held_by='Sgt Karim' where id=$1", [tc]);
const hist = (await q("select held_by, to_at from appointment_holders where profile_id=$1 order by from_at", [tc])).rows;
ok(hist.length === 2 && hist[0].to_at !== null && hist[1].held_by === "Sgt Karim", "Handover history kept for an appointment login");
const offr = await mk("BA 9010", "Lt", "Offr", "Pl Offr", "rdo");
const lvO = (await as(users.rep, `insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, applied_by) values ($1,$2,bd_today()+70,bd_today()+72,$3) returning id`, [offr, al, users.rep])).rows[0].id;
await expectError(users.comd, "select leave_action($1,'approve')", [lvO], "Coy Comd does not approve an officer's leave");
await as(users.adjt, "select leave_action($1,'approve')", [lvO]);
ok((await q("select status from leave_applications where id=$1", [lvO])).rows[0].status === "Approved", "Adjt approves officer's leave");
const lvA = (await q(`insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, status) values ($1,$2,bd_today()+80,bd_today()+81,'Applied') returning id`, [offr, al])).rows[0].id;
await q("update profiles set held_by_soldier=$2 where id=$1", [users.co, offr]);
await expectError(users.co, "select leave_action($1,'approve')", [lvA], "Nobody approves the leave of the person holding his own login");

console.log("\nv3.0 — soldier data, cycle plan, commitments");
await expectError(users.adjt, "update soldiers set accommodation='Tent' where id=$1", [sB], "Accommodation must be Snk Lines / Family Quarter / Out Living");
ok((await as(users.rep, "update soldiers set accommodation='Family Quarter', accommodation_details='Qtr 12/B' where id=$1 returning id", [sB])).rows.length === 1, "Accommodation recorded");
ok((await as(users.rep, `insert into soldier_records (soldier_id, kind, data) values ($1,'report','{"year":"2025","type":"APR","marks":"82","remarks":"Very good"}') returning id`, [sB])).rows.length === 1, "APR stored on the personal file");
const gt = (await q("select id from training_types where code='GT'")).rows[0].id;
ok((await as(users.rep, "insert into training_records (soldier_id, training_type_id, year, sequence_no, result) values ($1,$2,2026,1,'Ongoing') returning id", [sB, gt])).rows.length === 1, "Group Training can be 'On going'");
ok((await as(users.comd, "insert into cycle_plans (soldier_id, year, c1, c2, c3, c4) values ($1, 2027, 'Indl Training','Group Training','Unit Admin','Privilege Leave') returning company_id", [sB])).rows[0].company_id === coy.rdo, "Coy Comd plans the 4 cycles (coy filled in)");
await expectError(users.rep, "insert into cycle_plans (soldier_id, year, c1) values ($1, 2028, 'Unit Admin')", [sB], "Coy Rep cannot change the cycle plan");
await expectError(users.comd, "insert into cycle_plans (soldier_id, year, c1) values ($1, 2027, 'Unit Admin')", [sC], "Coy Comd cannot plan another coy");
await expectError(users.comd, "insert into cycle_plans (soldier_id, year, c1) values ($1, 2029, 'Holiday')", [sB], "Only the 4 activities are allowed");
ok((await as(users.solB, "select * from cycle_plans")).rows.length === 1, "Soldier sees his own plan");
await as(users.adjt, "insert into officer_commitments (date, time_from, soldier_id, title) values (bd_today(), '10:00', $1, 'Bde conference')", [sAdjt]);
ok((await as(users.co, "select * from officer_commitments")).rows.length === 1, "CO / Adjt see officers' commitments");
ok((await as(users.comd, "select * from officer_commitments")).rows.length === 1, "Coy Comd (an officer) sees the commitments board");
ok((await as(users.rep, "select * from officer_commitments")).rows.length === 0, "Coy Rep cannot see the commitments board");
await expectError(users.comd, "insert into officer_commitments (date, soldier_id, title) values (bd_today(), $1, 'x')", [sAdjt], "An officer cannot add commitments for another officer");
ok((await as(users.comd, "insert into officer_commitments (date, soldier_id, title) values (bd_today(), $1, 'Coy inspection') returning id", [sComd])).rows.length === 1, "An officer adds his own commitment");

console.log("\nv3.2 — notices, leave routing, Speed March, officers' tasks");
ok((await q("select completion_only from training_types where code='SM'")).rows[0].completion_only === true, "Speed March recorded as Completed / Yet to complete / Exempted");
ok((await as(users.comd, `insert into notices (title, company_id, attachments) values ('Coy order', $1, '[{"path":"2026-10/x.pdf","name":"order.pdf","type":"application/pdf","size":1000}]') returning id`, [coy.rdo])).rows.length === 1, "Notice with a PDF attachment");
// BHQ Pl leave is decided by the Adjt, not by a Coy Comd
const bhqSol = await mk("4090", "Sig", "OR", "Bhq Soldier", "bhq");
await user("bhqcomd", "coy_comd", "bhq", null);
const bhqComd = users.bhqcomd;
const lvB = (await q(`insert into leave_applications (soldier_id, leave_type_id, from_date, to_date, status) values ($1,$2,bd_today()+20,bd_today()+25,'Applied') returning id`, [bhqSol, al])).rows[0].id;
await expectError(bhqComd, "select leave_action($1,'approve')", [lvB], "BHQ Pl leave is not decided by a Coy Comd");
await as(users.adjt, "select leave_action($1,'approve')", [lvB]);
ok((await q("select status from leave_applications where id=$1", [lvB])).rows[0].status === "Approved", "Adjt approves BHQ Pl leave");
// officers' tasks
const offrTask = (await as(users.adjt, "insert into officer_tasks (title, deadline, assigned_to) values ('Prepare inquiry report', bd_today()+5, array[$1]::uuid[]) returning id", [offr])).rows[0].id;
await expectError(users.comd, "insert into officer_tasks (title) values ('x')", [], "Only CO / 2IC / Adjt assign officers' tasks");
ok((await as(users.comd, "select * from officer_tasks")).rows.length === 1, "Coy Comd (officer) sees the officers' task board");
ok((await as(users.rep, "select * from officer_tasks")).rows.length === 0 && (await as(users.solA, "select * from officer_tasks")).rows.length === 0, "Coy Rep and soldiers do not see officers' tasks");
await q("update profiles set held_by_soldier=$2 where id=$1", [users.comd, offr]);
await as(users.comd, "update officer_tasks set status='Completed', title='changed' where id=$1", [offrTask]);
const tk = (await q("select status, title, completed_at from officer_tasks where id=$1", [offrTask])).rows[0];
ok(tk.status === "Completed" && tk.title === "Prepare inquiry report" && tk.completed_at, "Assigned officer updates only the status of his own task");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
