-- =====================================================================
-- 5 SIGNAL BATTALION — UNIT MANAGEMENT SYSTEM (UMS) v3.0
-- Fresh database schema for Supabase (PostgreSQL 15+)
--
-- Run this ENTIRE file once in: Supabase Dashboard > SQL Editor > New query
-- It is safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY).
--
-- Contents
--   1. Core tables (companies, soldiers, soldier records, profiles)
--   2. Profile change requests (soldier self-update with approval)
--   3. Leave management
--   4. Parade state
--   5. Training (tests, unit calendar, courses, individual training plan)
--   6. Daily activities (programme, duty roster), medical, notices
--   7. Settings and audit log
--   8. Security helpers, triggers, workflow functions (RPC)
--   9. Row Level Security policies
--  10. Storage bucket for soldier photos
--  11. Default reference data
--  12. v2.1: distance from IB, unique Personal No, new ID applications, profile completion
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. CORE TABLES
-- ---------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  short_name text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.soldiers (
  id uuid primary key default gen_random_uuid(),
  -- Identity
  snk_no text not null unique,
  rank text not null,
  category text not null check (category in ('Offr','JCO','OR')),
  trade text,
  name text not null,
  name_bn text,
  -- Posting in unit
  company_id uuid not null references public.companies(id) on delete restrict,
  platoon text,
  appointment text,
  status text not null default 'Serving'
    check (status in ('Serving','Retired','Discharged','Transferred Out','Deceased','Deserted')),
  -- Service dates
  date_of_birth date,
  date_of_enrolment date,
  date_of_rank date,
  date_joined_unit date,
  retirement_date date,
  previous_unit text,
  -- Physical
  height_in numeric(5,1) check (height_in is null or height_in between 40 and 90),
  weight_lbs numeric(5,1) check (weight_lbs is null or weight_lbs between 60 and 400),
  blood_group text,
  medical_category text default 'A',
  medical_remarks text,
  -- Personal
  religion text,
  marital_status text,
  date_of_marriage date,
  spouse_name text,
  education text,
  nid_no text,
  -- Home & contact
  home_division text,
  home_district text,
  home_upazila text,
  distance_from_ib_km numeric(6,1),
  permanent_address text,
  present_address text,
  mobile text,
  alt_mobile text,
  email text,
  emergency_name text,
  emergency_relation text,
  emergency_mobile text,
  -- Attachment (drives the parade state automatically)
  atts_type text check (atts_type is null or atts_type in ('Temp Atts','Perm Atts')),
  atts_location text,
  atts_from date,
  atts_to date,
  -- Misc
  photo_path text,
  remarks text,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists soldiers_company_idx on public.soldiers(company_id, status);
create index if not exists soldiers_status_idx on public.soldiers(status);

-- Flexible one-to-many records kept on each soldier's file.
-- kind: family | education | course | discipline | award | posting | medical
create table if not exists public.soldier_records (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  kind text not null check (kind in ('family','education','course','discipline','award','posting','medical')),
  record_date date,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists soldier_records_soldier_idx on public.soldier_records(soldier_id, kind);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  soldier_id uuid unique references public.soldiers(id) on delete set null,
  full_name text,
  role text not null default 'soldier'
    check (role in ('admin','co','2ic','adjt','coy_comd','coy_rep','bn_rep','clk','soldier')),
  company_id uuid references public.companies(id) on delete set null,
  active boolean not null default false,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. PROFILE CHANGE REQUESTS (soldier updates own profile -> approval)
-- ---------------------------------------------------------------------
create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  changes jsonb not null default '{}'::jsonb,       -- { field: new value }
  old_values jsonb not null default '{}'::jsonb,    -- { field: value at time of request }
  record_ops jsonb not null default '[]'::jsonb,    -- [{op:add|update|delete, kind, id?, record_date?, data?}]
  note text,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now()
);
create index if not exists pcr_status_idx on public.profile_change_requests(status, company_id);
create index if not exists pcr_soldier_idx on public.profile_change_requests(soldier_id);

-- ---------------------------------------------------------------------
-- 3. LEAVE MANAGEMENT
-- ---------------------------------------------------------------------
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  annual_quota integer check (annual_quota is null or annual_quota >= 0), -- null = no annual limit
  active boolean not null default true,
  display_order integer not null default 0
);

create table if not exists public.leave_applications (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  from_date date not null,
  to_date date not null,
  days integer generated always as ((to_date - from_date) + 1) stored,
  reason text,
  leave_address text,
  contact_no text,
  status text not null default 'Applied'
    check (status in ('Applied','Recommended','Approved','Rejected','Cancelled')),
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  recommended_by uuid references auth.users(id) on delete set null,
  recommended_at timestamptz,
  recommend_remarks text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_remarks text,
  rejoin_date date,
  rejoin_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_dates_valid check (to_date >= from_date)
);
create index if not exists leave_soldier_idx on public.leave_applications(soldier_id, from_date);
create index if not exists leave_status_idx on public.leave_applications(status, company_id);
create index if not exists leave_dates_idx on public.leave_applications(from_date, to_date);

-- ---------------------------------------------------------------------
-- 4. PARADE STATE
-- ---------------------------------------------------------------------
create table if not exists public.parade_states (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  state_type text not null default 'Morning State',
  status text not null default 'Open' check (status in ('Open','Finalized')),
  created_by uuid references auth.users(id) on delete set null,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique(date, state_type)
);
create index if not exists parade_states_date_idx on public.parade_states(date desc);

create table if not exists public.parade_entries (
  id uuid primary key default gen_random_uuid(),
  parade_state_id uuid not null references public.parade_states(id) on delete cascade,
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  state text not null default 'Present' check (state in ('Present','Absent')),
  absent_reason text,      -- Leave | Course | Hospital | Temp Atts | Perm Atts | AWOL | Detention | Other
  employment text,         -- null = On Parade; otherwise employed (Guard, Duty Offr, Office ...)
  location text,
  remarks text,
  is_manual boolean not null default false,  -- true once a user has edited the line
  auto_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(parade_state_id, soldier_id)
);
create index if not exists parade_entries_state_idx on public.parade_entries(parade_state_id, company_id);

create table if not exists public.coy_submissions (
  id uuid primary key default gen_random_uuid(),
  parade_state_id uuid not null references public.parade_states(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Accepted','Returned')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  remarks text,
  unique(parade_state_id, company_id)
);

-- ---------------------------------------------------------------------
-- 5. TRAINING
-- ---------------------------------------------------------------------
create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  frequency integer not null default 1 check (frequency between 1 and 12), -- required times per year
  sequence_label text not null default 'No',  -- e.g. Period (IPFT), March No (Speed March)
  max_attempts integer not null default 1 check (max_attempts between 1 and 5),
  has_marks boolean not null default false,
  pass_mark numeric(8,2),
  applies_to text[] not null default array['Offr','JCO','OR'],
  active boolean not null default true,
  display_order integer not null default 0
);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  sequence_no integer not null default 1 check (sequence_no between 1 and 12),
  attempt_no integer not null default 1 check (attempt_no between 1 and 5),
  test_date date,
  result text not null check (result in ('Pass','Fail','Exempted','Absent')),
  marks numeric(8,2),
  grade text,
  part1_no text,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(soldier_id, training_type_id, year, sequence_no, attempt_no)
);
-- Name of each required occurrence, e.g. IPFT {1st Bi-Annual, 2nd Bi-Annual}
alter table public.training_types add column if not exists sequence_names text[] not null default '{}';
-- v2.1: tests recorded as Completed / Not completed (Group Training) instead of Pass / Fail
alter table public.training_types add column if not exists completion_only boolean not null default false;

create index if not exists training_records_year_idx on public.training_records(year, training_type_id);
create index if not exists training_records_soldier_idx on public.training_records(soldier_id, year);

-- Unit training calendar / training programme
create table if not exists public.training_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'Training'
    check (event_type in ('Training','Test','Cadre','Exercise','Range','Lecture','Sports','Inspection','Other')),
  training_type_id uuid references public.training_types(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade, -- null = unit-wide
  start_date date not null,
  end_date date not null,
  venue text,
  conducting_officer text,
  description text,
  status text not null default 'Planned' check (status in ('Planned','Ongoing','Completed','Cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_event_dates check (end_date >= start_date)
);
create index if not exists training_events_dates_idx on public.training_events(start_date, end_date);

create table if not exists public.course_nominations (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  course_name text not null,
  institution text,
  course_type text not null default 'External' check (course_type in ('Internal','External')),
  from_date date,
  to_date date,
  status text not null default 'Nominated'
    check (status in ('Nominated','Attending','Completed','Failed','Withdrawn')),
  result text,
  grade text,
  part1_no text,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_dates check (to_date is null or from_date is null or to_date >= from_date)
);
create index if not exists course_soldier_idx on public.course_nominations(soldier_id);
create index if not exists course_dates_idx on public.course_nominations(from_date, to_date);

-- Individual Training Plan (custom items; mandatory tests are computed from training_records)
create table if not exists public.itp_items (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  year integer not null check (year between 2000 and 2100),
  title text not null,
  category text not null default 'Other'
    check (category in ('Physical','Weapon','Trade','Course','Cadre','Education','Leadership','Other')),
  target_date date,
  status text not null default 'Planned' check (status in ('Planned','In Progress','Completed','Not Achieved')),
  completed_date date,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists itp_soldier_year_idx on public.itp_items(soldier_id, year);

-- Daily training activity photos (shown on the dashboard)
create table if not exists public.training_photos (
  id uuid primary key default gen_random_uuid(),
  taken_on date not null default ((now() at time zone 'Asia/Dhaka')::date),
  caption text,
  event_id uuid references public.training_events(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null, -- null = unit
  path text not null,               -- storage path in bucket training-photos
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists training_photos_date_idx on public.training_photos(taken_on desc);

-- ---------------------------------------------------------------------
-- 6. DAILY ACTIVITIES, MEDICAL, NOTICES
-- ---------------------------------------------------------------------
create table if not exists public.daily_programmes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time_from time,
  time_to time,
  activity text not null,
  venue text,
  participants text,
  company_id uuid references public.companies(id) on delete cascade, -- null = unit-wide
  responsible text,
  dress text,
  remarks text,
  status text not null default 'Planned' check (status in ('Planned','Ongoing','Completed','Cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_programmes_date_idx on public.daily_programmes(date, time_from);

create table if not exists public.duty_roster (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  duty_type text not null,
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  shift text,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(date, duty_type, soldier_id)
);
create index if not exists duty_roster_date_idx on public.duty_roster(date);
create index if not exists duty_roster_soldier_idx on public.duty_roster(soldier_id, date);

create table if not exists public.sick_reports (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  report_date date not null,
  complaint text,
  disposal text not null default 'Duty'
    check (disposal in ('Duty','Light Duty','Excused Duty','Admitted','Referred')),
  days integer not null default 1 check (days between 0 and 365),
  hospital text,
  discharge_date date,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sick_reports_date_idx on public.sick_reports(report_date);
create index if not exists sick_reports_soldier_idx on public.sick_reports(soldier_id);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  category text not null default 'Notice' check (category in ('Notice','Order','Circular','Event','Other')),
  priority text not null default 'Normal' check (priority in ('Normal','Important','Urgent')),
  company_id uuid references public.companies(id) on delete cascade, -- null = whole unit
  publish_date date not null default ((now() at time zone 'Asia/Dhaka')::date),
  expiry_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notices_date_idx on public.notices(publish_date desc);

-- ---------------------------------------------------------------------
-- 7. SETTINGS & AUDIT
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  changes jsonb
);
create index if not exists audit_log_record_idx on public.audit_log(table_name, record_id);
create index if not exists audit_log_at_idx on public.audit_log(at desc);

-- ---------------------------------------------------------------------
-- 8. SECURITY HELPERS
-- ---------------------------------------------------------------------
create or replace function public.bd_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.app_company()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.app_soldier()
returns uuid language sql stable security definer set search_path = public as $$
  select soldier_id from public.profiles where id = auth.uid() and active = true;
$$;

-- ROLE MODEL
--   Super admin   admin, co, 2ic, adjt  -> everything, every company
--   coy_comd      admin of OWN coy: approves leave & profile updates, coy plans
--   coy_rep       OWN coy operations: parade state, soldiers, training, leave on behalf
--   bn_rep        BSM / Bn Daily: WHOLE unit view; prepares the full Bn parade state
--                 (all coys, accept / return, 2nd State) and the duty roster
--   clk           WHOLE unit: view & sort everything; edits personal info & training
--   soldier       himself only (requests go to his Coy Comd)

-- Super admin (Adjt / 2IC / CO / Admin).
create or replace function public.is_command()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin','co','2ic','adjt'), false);
$$;

-- Sees every company: super admins and the clerk.
create or replace function public.is_unit_wide()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_command() or public.app_role() = 'clk', false);
$$;

-- Bn Rep (BSM / Bn Daily): prepares the full battalion parade state and duty roster.
create or replace function public.is_bn_rep()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'bn_rep', false);
$$;

-- Sees every company (read-only for the Bn Rep).
create or replace function public.can_view_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_unit_wide() or public.is_bn_rep(), false);
$$;

-- Accepts / returns coy states, edits submitted lines, starts the 2nd State (finalize stays with Adjt / 2IC / CO).
create or replace function public.is_parade_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_command() or public.is_bn_rep(), false);
$$;

create or replace function public.can_view_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.can_view_all()
    or (public.app_role() in ('coy_comd','coy_rep') and p_company = public.app_company()),
    false);
$$;

-- Personnel & training records: super admins, clerk (all coys), coy comd / coy rep (own coy).
create or replace function public.can_edit_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_unit_wide()
    or (public.app_role() in ('coy_comd','coy_rep') and p_company = public.app_company()),
    false);
$$;

-- Coy operations (parade state, duty roster, leave on behalf, rejoin): super admins, coy comd / rep of own coy.
create or replace function public.can_operate_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_command()
    or (public.app_role() in ('coy_comd','coy_rep') and p_company = public.app_company()),
    false);
$$;

-- Coy command (approvals, coy programme / calendar / notices): super admins and the coy comd of own coy.
create or replace function public.can_command_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_command()
    or (public.app_role() = 'coy_comd' and p_company = public.app_company()),
    false);
$$;

-- Daily parade state lines of a company: coy staff of own coy, Bn Rep and super admins.
create or replace function public.can_parade_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_operate_company(p_company) or public.is_bn_rep(), false);
$$;

-- Duty roster: Coy Rep / Coy Comd (own coy), Bn Rep (all coys) and super admins.
create or replace function public.can_roster_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_operate_company(p_company) or public.is_bn_rep(), false);
$$;

-- Non-sensitive list of soldiers for pickers, duty rosters etc.
-- Available to every active user (soldiers cannot read other soldiers' full files).
drop function if exists public.soldier_directory();
create or replace function public.soldier_directory()
returns table(id uuid, snk_no text, rank text, category text, trade text, name text, name_bn text, company_id uuid, status text, display_order integer, appointment text)
language sql stable security definer set search_path = public as $$
  select s.id, s.snk_no, s.rank, s.category, s.trade, s.name, s.name_bn, s.company_id, s.status, s.display_order, s.appointment
  from public.soldiers s
  where public.app_role() is not null
  order by s.display_order, s.snk_no;
$$;

-- ---------------------------------------------------------------------
-- 8b. TRIGGERS
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['soldiers','soldier_records','profiles','leave_applications','training_records',
                           'training_events','course_nominations','itp_items','daily_programmes','sick_reports','notices']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- Child records always take their company from the soldier's master record.
create or replace function public.sync_company_from_soldier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select s.company_id into new.company_id from public.soldiers s where s.id = new.soldier_id;
  if new.company_id is null then
    raise exception 'Soldier record not found';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['soldier_records','profile_change_requests','leave_applications','training_records',
                           'course_nominations','itp_items','duty_roster','sick_reports']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_sync_company', t);
    execute format('create trigger %I before insert or update of soldier_id, company_id on public.%I for each row execute function public.sync_company_from_soldier()', t || '_sync_company', t);
  end loop;
end $$;

-- When a soldier moves to another company, carry the company onto his records.
create or replace function public.soldier_company_cascade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    update public.soldier_records set company_id = new.company_id where soldier_id = new.id;
    update public.profile_change_requests set company_id = new.company_id where soldier_id = new.id;
    update public.leave_applications set company_id = new.company_id where soldier_id = new.id;
    update public.training_records set company_id = new.company_id where soldier_id = new.id;
    update public.course_nominations set company_id = new.company_id where soldier_id = new.id;
    update public.itp_items set company_id = new.company_id where soldier_id = new.id;
    update public.sick_reports set company_id = new.company_id where soldier_id = new.id;
    update public.duty_roster set company_id = new.company_id where soldier_id = new.id and date >= public.bd_today();
    update public.profiles set company_id = new.company_id where soldier_id = new.id and role = 'soldier';
    update public.parade_entries e set company_id = new.company_id
      from public.parade_states ps
      where ps.id = e.parade_state_id and ps.status = 'Open' and e.soldier_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists soldiers_company_cascade on public.soldiers;
create trigger soldiers_company_cascade after update of company_id on public.soldiers
  for each row execute function public.soldier_company_cascade();

-- Prevent overlapping active leave for the same soldier.
create or replace function public.leave_no_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('Applied','Recommended','Approved') and exists (
    select 1 from public.leave_applications l
    where l.soldier_id = new.soldier_id
      and l.id <> new.id
      and l.status in ('Applied','Recommended','Approved')
      and l.from_date <= new.to_date
      and coalesce(l.rejoin_date - 1, l.to_date) >= new.from_date
  ) then
    raise exception 'This soldier already has leave applied/approved overlapping % to %', new.from_date, new.to_date;
  end if;
  return new;
end;
$$;
drop trigger if exists leave_no_overlap_trigger on public.leave_applications;
create trigger leave_no_overlap_trigger before insert or update of from_date, to_date, status on public.leave_applications
  for each row execute function public.leave_no_overlap();

-- Keep a parade entry consistent with its Present/Absent state.
create or replace function public.normalize_parade_entry()
returns trigger language plpgsql as $$
begin
  if new.state = 'Absent' then
    new.employment = null;
    if new.absent_reason is null or btrim(new.absent_reason) = '' then new.absent_reason = 'Other'; end if;
  else
    new.absent_reason = null;
    if new.employment is not null and btrim(new.employment) = '' then new.employment = null; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists normalize_parade_entry_trigger on public.parade_entries;
create trigger normalize_parade_entry_trigger before insert or update on public.parade_entries
  for each row execute function public.normalize_parade_entry();

-- New Auth users get an INACTIVE profile; the manage-users function activates them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'soldier', false)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Audit trail
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_changes jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_changes := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_id := new.id;
    v_changes := to_jsonb(new);
  else
    v_id := new.id;
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', to_jsonb(old) -> n.key, 'to', n.value)), '{}'::jsonb)
      into v_changes
      from jsonb_each(to_jsonb(new)) n
     where n.value is distinct from (to_jsonb(old) -> n.key)
       and n.key not in ('updated_at','updated_by');
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  end if;
  insert into public.audit_log(actor, table_name, record_id, action, changes)
  values (auth.uid(), tg_table_name, v_id, tg_op, v_changes);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['soldiers','soldier_records','profiles','leave_applications','profile_change_requests','training_records','sick_reports']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8c. PARADE STATE ENGINE
-- Works out where a soldier should be on a date from the records already in
-- the system. Order of precedence:
--   Attachment > Approved leave > External course > Admitted in hospital
--   > Excused/Light duty > Duty roster > On parade
-- ---------------------------------------------------------------------
create or replace function public.parade_auto_values(p_soldier uuid, p_date date)
returns table(state text, absent_reason text, employment text, location text, auto_note text)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.soldiers%rowtype;
  v_text text;
  v_text2 text;
  v_date date;
begin
  select * into s from public.soldiers where id = p_soldier;

  if s.atts_type is not null
     and (s.atts_from is null or s.atts_from <= p_date)
     and (s.atts_to is null or s.atts_to >= p_date) then
    return query select 'Absent'::text, s.atts_type, null::text, s.atts_location, 'Attachment on soldier record'::text;
    return;
  end if;

  select lt.name, l.to_date into v_text, v_date
  from public.leave_applications l
  join public.leave_types lt on lt.id = l.leave_type_id
  where l.soldier_id = p_soldier
    and l.status = 'Approved'
    and l.from_date <= p_date
    and (
      (l.rejoin_date is not null and l.rejoin_date > p_date)
      or (l.rejoin_date is null and l.to_date >= p_date - 30)
    )
  order by l.from_date desc
  limit 1;
  if v_text is not null then
    return query select 'Absent'::text, 'Leave'::text, null::text, null::text,
      case when v_date < p_date then v_text || ' — due back ' || to_char(v_date, 'DD Mon YY') || ', rejoin not reported'
           else v_text || ' till ' || to_char(v_date, 'DD Mon YY') end;
    return;
  end if;

  select c.course_name, c.institution into v_text, v_text2
  from public.course_nominations c
  where c.soldier_id = p_soldier
    and c.course_type = 'External'
    and c.status in ('Nominated','Attending')
    and c.from_date <= p_date and coalesce(c.to_date, c.from_date) >= p_date
  order by c.from_date desc
  limit 1;
  if v_text is not null then
    return query select 'Absent'::text, 'Course'::text, null::text, v_text2, v_text;
    return;
  end if;

  select coalesce(r.hospital, 'Hospital'), r.complaint into v_text, v_text2
  from public.sick_reports r
  where r.soldier_id = p_soldier
    and r.disposal = 'Admitted'
    and r.report_date <= p_date
    and (r.discharge_date is null or r.discharge_date > p_date)
  order by r.report_date desc
  limit 1;
  if v_text is not null then
    return query select 'Absent'::text, 'Hospital'::text, null::text, v_text, coalesce('Admitted: ' || v_text2, 'Admitted');
    return;
  end if;

  select r.disposal into v_text
  from public.sick_reports r
  where r.soldier_id = p_soldier
    and r.disposal in ('Excused Duty','Light Duty')
    and r.report_date <= p_date
    and r.report_date + greatest(r.days, 1) - 1 >= p_date
  order by r.report_date desc
  limit 1;
  if v_text is not null then
    return query select 'Present'::text, null::text, v_text, null::text, 'From sick report'::text;
    return;
  end if;

  select c.course_name into v_text
  from public.course_nominations c
  where c.soldier_id = p_soldier
    and c.course_type = 'Internal'
    and c.status in ('Nominated','Attending')
    and c.from_date <= p_date and coalesce(c.to_date, c.from_date) >= p_date
  order by c.from_date desc
  limit 1;
  if v_text is not null then
    return query select 'Present'::text, null::text, 'Cadre/Course'::text, null::text, v_text;
    return;
  end if;

  select d.duty_type into v_text
  from public.duty_roster d
  where d.soldier_id = p_soldier and d.date = p_date
  order by d.created_at
  limit 1;
  if v_text is not null then
    return query select 'Present'::text, null::text, v_text, null::text, 'From duty roster'::text;
    return;
  end if;

  return query select 'Present'::text, null::text, null::text, null::text, null::text;
end;
$$;

-- Refresh an OPEN parade state: add missing soldiers, drop non-serving ones,
-- and recalculate every line nobody has edited by hand (only for companies
-- that have not yet submitted).
create or replace function public.sync_parade_state(p_state_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_status text;
begin
  if public.app_role() is null or public.app_role() = 'soldier' then
    raise exception 'Not permitted';
  end if;
  select ps.date, ps.status into v_date, v_status from public.parade_states ps where ps.id = p_state_id;
  if v_status is distinct from 'Open' then
    return;
  end if;

  insert into public.coy_submissions (parade_state_id, company_id)
  select p_state_id, c.id from public.companies c where c.active
  on conflict (parade_state_id, company_id) do nothing;

  delete from public.parade_entries e
  using public.soldiers s
  where e.parade_state_id = p_state_id and s.id = e.soldier_id and s.status <> 'Serving';

  insert into public.parade_entries (parade_state_id, soldier_id, company_id, state, absent_reason, employment, location, auto_note)
  select p_state_id, s.id, s.company_id, a.state, a.absent_reason, a.employment, a.location, a.auto_note
  from public.soldiers s
  cross join lateral public.parade_auto_values(s.id, v_date) a
  where s.status = 'Serving'
  on conflict (parade_state_id, soldier_id) do nothing;

  update public.parade_entries e
     set state = a.state, absent_reason = a.absent_reason, employment = a.employment,
         location = a.location, auto_note = a.auto_note, company_id = s.company_id
    from public.soldiers s
    cross join lateral public.parade_auto_values(s.id, v_date) a
   where e.parade_state_id = p_state_id
     and e.soldier_id = s.id
     and e.is_manual = false
     and not exists (
       select 1 from public.coy_submissions cs
       where cs.parade_state_id = p_state_id and cs.company_id = e.company_id
         and cs.status in ('Submitted','Accepted'))
     and (e.state, e.absent_reason, e.employment, e.location, e.auto_note, e.company_id)
         is distinct from (a.state, a.absent_reason, a.employment, a.location, a.auto_note, s.company_id);
end;
$$;

-- Get (or create) the 1st State for a date and bring it up to date.
create or replace function public.ensure_parade_state(p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_status text;
begin
  if public.app_role() is null or public.app_role() = 'soldier' then
    raise exception 'Not permitted';
  end if;
  select id, status into v_id, v_status from public.parade_states where date = p_date and state_type = '1st State';
  if v_id is null then
    if p_date > public.bd_today() + 1 then
      raise exception 'A parade state can be opened at most one day in advance';
    end if;
    if p_date < public.bd_today() and not public.is_command() then
      raise exception 'Only Adjt / 2IC / CO can open a parade state for a past date';
    end if;
    insert into public.parade_states (date, state_type, status, created_by)
    values (p_date, '1st State', 'Open', auth.uid())
    on conflict (date, state_type) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.parade_states where date = p_date and state_type = '1st State';
    end if;
  end if;
  perform public.sync_parade_state(v_id);
  return v_id;
end;
$$;

-- Start the 2nd State from the finalized 1st State of the same date.
create or replace function public.start_second_state(p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_first uuid;
  v_first_status text;
  v_id uuid;
begin
  if not public.is_parade_master() then
    raise exception 'Only Adjt / 2IC / CO or the Bn Rep can start the 2nd State';
  end if;
  select id, status into v_first, v_first_status from public.parade_states where date = p_date and state_type = '1st State';
  if v_first is null then raise exception 'There is no 1st State for this date'; end if;
  if v_first_status <> 'Finalized' then raise exception 'Finalize the 1st State first'; end if;

  select id into v_id from public.parade_states where date = p_date and state_type = '2nd State';
  if v_id is not null then return v_id; end if;

  insert into public.parade_states (date, state_type, status, created_by)
  values (p_date, '2nd State', 'Open', auth.uid())
  returning id into v_id;

  insert into public.parade_entries (parade_state_id, soldier_id, company_id, state, absent_reason, employment, location, remarks, is_manual, auto_note, updated_by)
  select v_id, e.soldier_id, e.company_id, e.state, e.absent_reason, e.employment, e.location, e.remarks, e.is_manual, e.auto_note, auth.uid()
  from public.parade_entries e
  where e.parade_state_id = v_first;

  perform public.sync_parade_state(v_id);
  return v_id;
end;
$$;

-- Company submission workflow: Draft -> Submitted -> Accepted (or Returned -> Submitted)
create or replace function public.set_submission_status(p_state_id uuid, p_company uuid, p_status text, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_state_status text;
  v_current text;
begin
  select status into v_state_status from public.parade_states where id = p_state_id;
  if v_state_status is distinct from 'Open' then raise exception 'This parade state is finalized'; end if;
  select status into v_current from public.coy_submissions where parade_state_id = p_state_id and company_id = p_company;
  if v_current is null then raise exception 'Company submission not found'; end if;

  if p_status = 'Submitted' then
    if not public.can_parade_company(p_company) then raise exception 'Not permitted'; end if;
    update public.coy_submissions set status = 'Submitted', submitted_by = auth.uid(), submitted_at = now(), remarks = coalesce(p_remarks, remarks)
     where parade_state_id = p_state_id and company_id = p_company;
  elsif p_status = 'Draft' then
    if not public.can_parade_company(p_company) then raise exception 'Not permitted'; end if;
    if v_current = 'Accepted' and not public.is_parade_master() then raise exception 'Already accepted by Adjt / Bn Rep'; end if;
    update public.coy_submissions set status = 'Draft' where parade_state_id = p_state_id and company_id = p_company;
  elsif p_status in ('Accepted','Returned') then
    if not public.is_parade_master() then raise exception 'Only Adjt / 2IC / CO or the Bn Rep can accept or return a state'; end if;
    update public.coy_submissions set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), remarks = coalesce(p_remarks, remarks)
     where parade_state_id = p_state_id and company_id = p_company;
  else
    raise exception 'Unknown status %', p_status;
  end if;
end;
$$;

create or replace function public.finalize_parade_state(p_state_id uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pending integer;
begin
  if not public.is_command() then raise exception 'Only Admin, CO, 2IC or Adjt can finalize'; end if;
  select count(*) into v_pending
  from public.coy_submissions cs join public.companies c on c.id = cs.company_id
  where cs.parade_state_id = p_state_id and c.active and cs.status not in ('Submitted','Accepted');
  if v_pending > 0 and not p_force then
    raise exception 'Cannot finalize: % company state(s) not yet submitted', v_pending;
  end if;
  update public.coy_submissions set status = 'Accepted', reviewed_by = coalesce(reviewed_by, auth.uid()), reviewed_at = coalesce(reviewed_at, now())
   where parade_state_id = p_state_id;
  update public.parade_states set status = 'Finalized', finalized_by = auth.uid(), finalized_at = now()
   where id = p_state_id;
end;
$$;

create or replace function public.reopen_parade_state(p_state_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_command() then raise exception 'Only Adjt / 2IC / CO can reopen a state'; end if;
  update public.parade_states set status = 'Open', finalized_by = null, finalized_at = null where id = p_state_id;
end;
$$;

-- Is this line editable by the current user right now?
create or replace function public.parade_entry_editable(p_state_id uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.parade_states ps where ps.id = p_state_id and ps.status = 'Open')
    and public.can_parade_company(p_company)
    and (
      public.is_parade_master()
      or not exists (select 1 from public.coy_submissions cs
                     where cs.parade_state_id = p_state_id and cs.company_id = p_company
                       and cs.status in ('Submitted','Accepted'))
    ), false);
$$;

-- ---------------------------------------------------------------------
-- 8d. LEAVE WORKFLOW
--   Applied -> Approved / Rejected by the soldier's Coy Comd
--              (a Coy Comd's own leave, and any leave, can be decided by Adjt / 2IC / CO)
--   Approved -> rejoin reported by Coy Rep / Coy Comd / super admin
-- ---------------------------------------------------------------------
create or replace function public.can_decide_leave(p_company uuid, p_soldier uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_command()
    or (public.app_role() = 'coy_comd' and p_company = public.app_company() and p_soldier is distinct from public.app_soldier()),
    false);
$$;

create or replace function public.leave_action(p_id uuid, p_action text, p_remarks text default null, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.leave_applications%rowtype;
begin
  select * into l from public.leave_applications where id = p_id for update;
  if not found then raise exception 'Leave application not found'; end if;

  if p_action in ('approve','reject','recommend') then
    if l.status not in ('Applied','Recommended') then raise exception 'This leave is already %', lower(l.status); end if;
    if not public.can_decide_leave(l.company_id, l.soldier_id) then
      raise exception 'Only the Coy Comd (or Adjt / 2IC / CO) can approve this leave';
    end if;
    update public.leave_applications
       set status = case when p_action = 'reject' then 'Rejected' else 'Approved' end,
           decided_by = auth.uid(), decided_at = now(), decision_remarks = p_remarks
     where id = p_id;

  elsif p_action = 'cancel' then
    if l.status in ('Rejected','Cancelled') then raise exception 'This leave is already %', lower(l.status); end if;
    if l.status = 'Approved' and not public.can_decide_leave(l.company_id, l.soldier_id) then
      raise exception 'Approved leave can only be cancelled by the Coy Comd or Adjt';
    end if;
    if not (l.soldier_id = public.app_soldier() or public.can_operate_company(l.company_id)) then
      raise exception 'Not permitted';
    end if;
    update public.leave_applications
       set status = 'Cancelled', decision_remarks = coalesce(p_remarks, decision_remarks), decided_by = auth.uid(), decided_at = now()
     where id = p_id;

  elsif p_action = 'rejoin' then
    if l.status <> 'Approved' then raise exception 'Only approved leave can be marked rejoined'; end if;
    if not public.can_operate_company(l.company_id) then raise exception 'Not permitted'; end if;
    if coalesce(p_date, public.bd_today()) < l.from_date then raise exception 'Rejoin date cannot be before leave start'; end if;
    update public.leave_applications
       set rejoin_date = coalesce(p_date, public.bd_today()), rejoin_by = auth.uid()
     where id = p_id;

  else
    raise exception 'Unknown leave action %', p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8e. PROFILE CHANGE REQUESTS
-- ---------------------------------------------------------------------
-- Fields a soldier may ask to change on his own file (v2.1: all personal info;
-- the Coy Comd verifies). Personal No, coy, status, attachment and discipline stay office-only.
create or replace function public.self_editable_fields()
returns text[] language sql immutable as $$
  select array[
    'category','rank','trade','name','name_bn','platoon','appointment','date_joined_unit','previous_unit',
    'date_of_birth','date_of_enrolment','date_of_rank','retirement_date',
    'height_in','weight_lbs','blood_group','medical_category','medical_remarks',
    'religion','marital_status','date_of_marriage','spouse_name','education','nid_no',
    'home_division','home_district','home_upazila','distance_from_ib_km','permanent_address','present_address',
    'mobile','alt_mobile','email','emergency_name','emergency_relation','emergency_mobile'
  ];
$$;

create or replace function public.review_profile_request(p_id uuid, p_approve boolean, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.profile_change_requests%rowtype;
  v_key text;
  v_val jsonb;
  v_type text;
  v_op jsonb;
  v_kinds text[] := array['family','education','course','posting','award','medical','vehicle'];
begin
  select * into r from public.profile_change_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'Pending' then raise exception 'Request is already %', lower(r.status); end if;
  if not public.can_command_company(r.company_id) then
    raise exception 'Only the Coy Comd (or Adjt / 2IC / CO) can approve profile updates';
  end if;

  if p_approve then
    for v_key, v_val in select * from jsonb_each(r.changes) loop
      if v_key = any(public.self_editable_fields()) then
        select format_type(a.atttypid, a.atttypmod) into v_type
          from pg_attribute a
         where a.attrelid = 'public.soldiers'::regclass and a.attname = v_key and not a.attisdropped;
        if v_type is not null then
          execute format('update public.soldiers set %I = $1::%s, updated_by = $3 where id = $2', v_key, v_type)
            using nullif(v_val #>> '{}', ''), r.soldier_id, auth.uid();
        end if;
      end if;
    end loop;

    for v_op in select * from jsonb_array_elements(r.record_ops) loop
      if (v_op ->> 'kind') = any(v_kinds) then
        if v_op ->> 'op' = 'add' then
          insert into public.soldier_records (soldier_id, kind, record_date, data, created_by)
          values (r.soldier_id, v_op ->> 'kind', nullif(v_op ->> 'record_date', '')::date, coalesce(v_op -> 'data', '{}'::jsonb), auth.uid());
        elsif v_op ->> 'op' = 'update' then
          update public.soldier_records
             set data = coalesce(v_op -> 'data', data),
                 record_date = coalesce(nullif(v_op ->> 'record_date', '')::date, record_date)
           where id = (v_op ->> 'id')::uuid and soldier_id = r.soldier_id and kind = v_op ->> 'kind';
        elsif v_op ->> 'op' = 'delete' then
          delete from public.soldier_records
           where id = (v_op ->> 'id')::uuid and soldier_id = r.soldier_id and kind = v_op ->> 'kind';
        end if;
      end if;
    end loop;
  end if;

  update public.profile_change_requests
     set status = case when p_approve then 'Approved' else 'Rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_remarks = p_remarks
   where id = p_id;
end;
$$;

create or replace function public.cancel_profile_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profile_change_requests set status = 'Cancelled'
   where id = p_id and status = 'Pending'
     and (soldier_id = public.app_soldier() or public.can_edit_company(company_id));
  if not found then raise exception 'Request not found or not pending'; end if;
end;
$$;

create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

-- Function execute permissions
do $$
declare f text;
begin
  foreach f in array array[
    'bd_today()','app_role()','app_company()','app_soldier()','is_command()','is_unit_wide()','is_bn_rep()','can_view_all()','is_parade_master()',
    'can_parade_company(uuid)','can_roster_company(uuid)',
    'can_view_company(uuid)','can_edit_company(uuid)','can_operate_company(uuid)','can_command_company(uuid)',
    'can_decide_leave(uuid, uuid)','soldier_directory()',
    'parade_auto_values(uuid, date)','sync_parade_state(uuid)','ensure_parade_state(date)','start_second_state(date)',
    'set_submission_status(uuid, uuid, text, text)','finalize_parade_state(uuid, boolean)','reopen_parade_state(uuid)',
    'parade_entry_editable(uuid, uuid)','leave_action(uuid, text, text, date)','self_editable_fields()',
    'review_profile_request(uuid, boolean, text)','cancel_profile_request(uuid)','mark_password_changed()']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies','soldiers','soldier_records','profiles','profile_change_requests','leave_types',
    'leave_applications','parade_states','parade_entries','coy_submissions','training_types','training_records',
    'training_events','course_nominations','itp_items','daily_programmes','duty_roster','sick_reports','notices',
    'app_settings','audit_log','training_photos']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Drop existing policies on OUR tables only, so this file can be re-run cleanly.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in (
    'companies','soldiers','soldier_records','profiles','profile_change_requests','leave_types',
    'leave_applications','parade_states','parade_entries','coy_submissions','training_types','training_records',
    'training_events','course_nominations','itp_items','daily_programmes','duty_roster','sick_reports','notices',
    'app_settings','audit_log','training_photos') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Reference data: readable by every active user
create policy companies_read on public.companies for select to authenticated using (public.app_role() is not null);
create policy companies_write on public.companies for all to authenticated
  using (public.is_command()) with check (public.is_command());

create policy leave_types_read on public.leave_types for select to authenticated using (public.app_role() is not null);
create policy leave_types_write on public.leave_types for all to authenticated
  using (public.is_command()) with check (public.is_command());

create policy training_types_read on public.training_types for select to authenticated using (public.app_role() is not null);
create policy training_types_write on public.training_types for all to authenticated
  using (public.is_command()) with check (public.is_command());

create policy settings_read on public.app_settings for select to authenticated using (public.app_role() is not null);
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_command()) with check (public.is_command());

-- Soldiers: staff see their scope; a soldier sees only himself. Self-changes go through requests.
create policy soldiers_read on public.soldiers for select to authenticated
  using (public.can_view_company(company_id) or id = public.app_soldier());
create policy soldiers_insert on public.soldiers for insert to authenticated
  with check (public.can_edit_company(company_id));
create policy soldiers_update on public.soldiers for update to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));
create policy soldiers_delete on public.soldiers for delete to authenticated
  using (public.is_command());

create policy soldier_records_read on public.soldier_records for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy soldier_records_write on public.soldier_records for all to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));

-- Profiles (user accounts)
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_unit_wide() or (public.app_role() in ('coy_comd','coy_rep') and company_id = public.app_company()));
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_command()) with check (public.is_command());

-- Profile change requests
create policy pcr_read on public.profile_change_requests for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy pcr_insert on public.profile_change_requests for insert to authenticated
  with check (status = 'Pending' and requested_by = auth.uid()
              and (soldier_id = public.app_soldier() or public.can_edit_company(company_id)));

-- Leave
create policy leave_read on public.leave_applications for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy leave_insert on public.leave_applications for insert to authenticated
  with check (status = 'Applied' and (soldier_id = public.app_soldier() or public.can_operate_company(company_id)));
create policy leave_update_pending on public.leave_applications for update to authenticated
  using (status = 'Applied' and (soldier_id = public.app_soldier() or public.can_operate_company(company_id)))
  with check (status = 'Applied' and (soldier_id = public.app_soldier() or public.can_operate_company(company_id)));

-- Parade state
create policy parade_states_read on public.parade_states for select to authenticated
  using (public.app_role() is not null and public.app_role() <> 'soldier');
create policy parade_entries_read on public.parade_entries for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy parade_entries_update on public.parade_entries for update to authenticated
  using (public.parade_entry_editable(parade_state_id, company_id))
  with check (public.parade_entry_editable(parade_state_id, company_id));
create policy coy_submissions_read on public.coy_submissions for select to authenticated
  using (public.app_role() is not null and public.app_role() <> 'soldier');

-- Training
create policy training_records_read on public.training_records for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy training_records_write on public.training_records for all to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));

create policy training_events_read on public.training_events for select to authenticated
  using (public.app_role() is not null and (company_id is null or company_id = public.app_company() or public.can_view_all()));
create policy training_events_write on public.training_events for all to authenticated
  using (public.is_command() or (company_id is not null and public.can_command_company(company_id)))
  with check (public.is_command() or (company_id is not null and public.can_command_company(company_id)));

create policy courses_read on public.course_nominations for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy courses_write on public.course_nominations for all to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));

create policy itp_read on public.itp_items for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy itp_write on public.itp_items for all to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));

-- Daily activities
create policy programmes_read on public.daily_programmes for select to authenticated
  using (public.app_role() is not null and (company_id is null or company_id = public.app_company() or public.can_view_all()));
create policy programmes_write on public.daily_programmes for all to authenticated
  using (public.is_command() or (company_id is not null and public.can_command_company(company_id)))
  with check (public.is_command() or (company_id is not null and public.can_command_company(company_id)));

create policy duty_roster_read on public.duty_roster for select to authenticated
  using (public.app_role() is not null);
create policy duty_roster_write on public.duty_roster for all to authenticated
  using (public.can_roster_company(company_id)) with check (public.can_roster_company(company_id));

-- Medical
create policy sick_reports_read on public.sick_reports for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy sick_reports_write on public.sick_reports for all to authenticated
  using (public.can_edit_company(company_id)) with check (public.can_edit_company(company_id));

-- Notices
create policy notices_read on public.notices for select to authenticated
  using (public.app_role() is not null and (company_id is null or company_id = public.app_company() or public.can_view_all()));
create policy notices_write on public.notices for all to authenticated
  using (public.is_command() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()))
  with check (public.is_command() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()));

-- Training photos: everyone sees unit photos and his own coy's; staff upload.
create policy training_photos_read on public.training_photos for select to authenticated
  using (public.app_role() is not null and (company_id is null or company_id = public.app_company() or public.can_view_all()));
create policy training_photos_write on public.training_photos for all to authenticated
  using (public.is_unit_wide() or (company_id is not null and public.can_operate_company(company_id)))
  with check (public.is_unit_wide() or (company_id is not null and public.can_operate_company(company_id)));

-- Audit log: read-only for Admin/Adjt (rows are written by triggers)
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_command());

-- ---------------------------------------------------------------------
-- 10. STORAGE: private bucket for soldier photos (path = <soldier_id>/<file>)
-- Skipped automatically when the storage schema is absent.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('soldier-photos', 'soldier-photos', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists soldier_photos_read on storage.objects';
    execute 'drop policy if exists soldier_photos_write on storage.objects';
    execute 'drop policy if exists soldier_photos_update on storage.objects';
    execute 'drop policy if exists soldier_photos_delete on storage.objects';

    execute $p$create policy soldier_photos_read on storage.objects for select to authenticated using (
      bucket_id = 'soldier-photos' and exists (
        select 1 from public.soldiers s where s.id::text = (storage.foldername(name))[1]
        and (public.can_view_company(s.company_id) or s.id = public.app_soldier())))$p$;
    execute $p$create policy soldier_photos_write on storage.objects for insert to authenticated with check (
      bucket_id = 'soldier-photos' and exists (
        select 1 from public.soldiers s where s.id::text = (storage.foldername(name))[1]
        and public.can_edit_company(s.company_id)))$p$;
    execute $p$create policy soldier_photos_update on storage.objects for update to authenticated using (
      bucket_id = 'soldier-photos' and exists (
        select 1 from public.soldiers s where s.id::text = (storage.foldername(name))[1]
        and public.can_edit_company(s.company_id)))$p$;
    execute $p$create policy soldier_photos_delete on storage.objects for delete to authenticated using (
      bucket_id = 'soldier-photos' and exists (
        select 1 from public.soldiers s where s.id::text = (storage.foldername(name))[1]
        and public.can_edit_company(s.company_id)))$p$;

    insert into storage.buckets (id, name, public) values ('training-photos', 'training-photos', false)
    on conflict (id) do nothing;
    execute 'drop policy if exists training_photos_obj_read on storage.objects';
    execute 'drop policy if exists training_photos_obj_write on storage.objects';
    execute 'drop policy if exists training_photos_obj_delete on storage.objects';
    execute $p$create policy training_photos_obj_read on storage.objects for select to authenticated using (
      bucket_id = 'training-photos' and public.app_role() is not null)$p$;
    execute $p$create policy training_photos_obj_write on storage.objects for insert to authenticated with check (
      bucket_id = 'training-photos' and public.app_role() is not null and public.app_role() <> 'soldier')$p$;
    execute $p$create policy training_photos_obj_delete on storage.objects for delete to authenticated using (
      bucket_id = 'training-photos' and (public.is_unit_wide() or public.app_role() in ('coy_comd','coy_rep')))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 11. DEFAULT REFERENCE DATA (edit later in Administration > Settings)
-- ---------------------------------------------------------------------
insert into public.companies (slug, name, short_name, display_order) values
  ('bhq','BHQ Pl','BHQ',1),
  ('hq','HQ Coy','HQ',2),
  ('rdo','Radio Coy','Radio',3),
  ('op','Op Coy','Op',4),
  ('rr','RR & Line Coy','RR & Line',5),
  ('106-bsc','106 BSC','106',6),
  ('113-bsc','113 BSC','113',7),
  ('121-bsc','121 BSC','121',8),
  ('205-absc','205 ABSC','205',9)
on conflict (slug) do nothing;
-- EME Sec (10th sub-unit) — skipped if a company of that name already exists
insert into public.companies (slug, name, short_name, display_order)
select 'eme','EME Sec','EME',10
 where not exists (select 1 from public.companies where slug = 'eme' or lower(name) in ('eme sec','eme','eme section'));

-- Leave entitlements below are starting values only — confirm against current
-- regulations and edit in Administration > Settings > Leave Types.
-- Only on a new install (an empty table), so renamed codes are never duplicated.
insert into public.leave_types (code, name, annual_quota, display_order)
select v.* from (values
  ('PL',   'Privilege Leave', 60, 1),
  ('CL',   'Casual Leave', 20, 2),
  ('ML',   'Maternity Leave', null::int, 3),
  ('MEDL', 'Medical Leave', null::int, 4),
  ('LPR',  'Leave Preparatory to Retirement', null::int, 5)
) as v(code, name, annual_quota, display_order)
where not exists (select 1 from public.leave_types)
on conflict (code) do nothing;

insert into public.training_types (code, name, frequency, sequence_label, sequence_names, max_attempts, has_marks, pass_mark, applies_to, display_order) values
  ('IPFT', 'IPFT', 2, 'Bi-Annual', array['1st Bi-Annual','2nd Bi-Annual'], 5, false, null, array['Offr','JCO','OR'], 1),
  ('RET',  'RET / Annual Firing', 1, 'Firing', array['Annual Firing'], 3, true, 13, array['Offr','JCO','OR'], 2),
  ('SM',   'Speed March', 4, 'March', array['Spd March 1','Spd March 2','Spd March 3','Spd March 4'], 1, false, null, array['Offr','JCO','OR'], 3),
  ('GT',   'Group Training', 1, 'Period', array['Group Training'], 1, false, null, array['JCO','OR'], 4)
on conflict (code) do nothing;
-- v2.1 (one time): Group Training is Completed / Not completed / Exempted; Swimming is no
-- longer tracked; 2Lt removed from the rank list. Re-running this file does not undo later
-- changes made in Settings.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'migration_v2_1') then
    update public.training_types set completion_only = true where code = 'GT';
    update public.training_types set active = false where code = 'SWIM';
    update public.app_settings set value = jsonb_set(value, '{Offr}', (value->'Offr') - '2Lt')
     where key = 'ranks' and (value->'Offr') ? '2Lt';
    insert into public.app_settings (key, value) values ('migration_v2_1', to_jsonb(now()::text));
  end if;
end $$;
-- Upgrade older installs to the bi-annual naming
update public.training_types set sequence_label = 'Bi-Annual', sequence_names = array['1st Bi-Annual','2nd Bi-Annual']
 where code = 'IPFT' and cardinality(sequence_names) = 0;
update public.training_types set sequence_label = 'March', sequence_names = array['Spd March 1','Spd March 2','Spd March 3','Spd March 4']
 where code = 'SM' and cardinality(sequence_names) = 0;
update public.training_types set sequence_names = array['Annual Firing'] where code = 'RET' and cardinality(sequence_names) = 0;

insert into public.app_settings (key, value) values
  ('unit', '{"name":"5 Signal Battalion","short":"5 SIG BN","motto":"Unit Management System"}'),
  ('absent_reasons', '["Leave","Course","Hospital","Temp Atts","Perm Atts","AWOL","Other"]'),
  ('employment_types', '["Duty Offr","Duty JCO","Duty NCO","Office","Workshop","MT","Mess","Drill Team","Athletics Team","Gp Training","Cadre/Course","Excused Duty","Light Duty","Other"]'),
  ('duty_types', '["Duty Offr","Duty JCO","Duty NCO","Quarter Guard","Duty Runner","Duty Clk","Night Picket","Station Duty (Mess B)"]'),
  ('ranks', '{"Offr":["Lt Col","Maj","Capt","Lt"],"JCO":["H/Capt","H/Lt","MWO","SWO","WO"],"OR":["Sgt","Cpl","L/Cpl","Snk"]}'),
  ('trades', '["Operator","Technician","Wireman Sigs","Driver","Clerk","Crypto","SMT","Cook (Mess)","Cook (Unit)","E&BR","C&L"]'),
  ('retirement_rules', '{"note":"Optional. Used only to ESTIMATE service left when a soldier has no retirement date entered. Fill per current rules.","svc_years_by_rank":{},"age_limit_by_category":{}}')
on conflict (key) do nothing;


-- =====================================================================
-- 12. v2.1 ADDITIONS — distance from IB, unique Personal No,
--     "Apply for new ID" and first-login profile completion
-- =====================================================================
alter table public.soldiers add column if not exists distance_from_ib_km numeric(6,1);
do $$ begin
  alter table public.soldiers add constraint soldiers_distance_ib_chk check (distance_from_ib_km is null or distance_from_ib_km between 0 and 2000);
exception when duplicate_object then null; end $$;

-- Personal No is compared without spaces and case: "BA 11108" = "ba11108".
create or replace function public.norm_snk(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g'));
$$;
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'soldiers_snk_norm_uidx') then
    if exists (select 1 from public.soldiers group by public.norm_snk(snk_no) having count(*) > 1) then
      raise notice 'Some Personal Nos differ only by spaces or case. Correct them, then run this file again to enforce uniqueness.';
    else
      create unique index soldiers_snk_norm_uidx on public.soldiers (public.norm_snk(snk_no));
    end if;
  end if;
end $$;

-- Personal information every soldier must have on file.
create or replace function public.profile_required_fields()
returns text[] language sql immutable as $$
  select array['name_bn','date_of_birth','date_of_enrolment','height_in','weight_lbs','blood_group',
    'religion','marital_status','education','nid_no','home_district','home_upazila','distance_from_ib_km',
    'permanent_address','present_address','mobile','emergency_name','emergency_relation','emergency_mobile'];
$$;

-- First login: a soldier fills the EMPTY fields of his own file. Values already on
-- file are never overwritten here (changing them still needs Coy Comd approval).
create or replace function public.complete_my_profile(p_fields jsonb, p_records jsonb default '[]'::jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid := public.app_soldier();
  v_key text; v_val jsonb; v_type text; v_rec jsonb; v_n integer := 0; v_done integer;
begin
  if v_sid is null then raise exception 'Your login is not linked to a soldier record'; end if;
  for v_key, v_val in select * from jsonb_each(coalesce(p_fields, '{}'::jsonb)) loop
    if v_key = any(public.self_editable_fields()) and nullif(v_val #>> '{}', '') is not null then
      select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
       where a.attrelid = 'public.soldiers'::regclass and a.attname = v_key and not a.attisdropped;
      if v_type is not null then
        execute format('update public.soldiers set %I = $1::%s, updated_by = $3 where id = $2 and (%I is null or %I::text = %L)', v_key, v_type, v_key, v_key, '')
          using v_val #>> '{}', v_sid, auth.uid();
        get diagnostics v_done = row_count;
        v_n := v_n + v_done;
      end if;
    end if;
  end loop;
  for v_rec in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    if (v_rec ->> 'kind') in ('family','education') then
      insert into public.soldier_records (soldier_id, kind, record_date, data, created_by)
      values (v_sid, v_rec ->> 'kind', nullif(v_rec ->> 'record_date', '')::date, coalesce(v_rec -> 'data', '{}'::jsonb), auth.uid());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- new ID applications
create table if not exists public.id_applications (
  id uuid primary key default gen_random_uuid(),
  snk_no text not null,
  category text not null check (category in ('Offr','JCO','OR')),
  rank text not null,
  name text not null,
  company_id uuid not null references public.companies(id) on delete restrict,
  data jsonb not null default '{}'::jsonb,      -- every other personal-info field
  records jsonb not null default '[]'::jsonb,   -- family members / education
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_remarks text,
  soldier_id uuid references public.soldiers(id) on delete set null,
  user_id uuid
);
create unique index if not exists id_app_pending_uidx on public.id_applications (public.norm_snk(snk_no)) where status = 'Pending';
create index if not exists id_app_status_idx on public.id_applications (status, submitted_at desc);
-- The chosen password is kept only as a bcrypt hash, readable by the server (service role) only.
create table if not exists public.id_application_secrets (
  application_id uuid primary key references public.id_applications(id) on delete cascade,
  password_hash text not null
);
alter table public.id_applications enable row level security;
alter table public.id_application_secrets enable row level security;
drop policy if exists id_app_read on public.id_applications;
create policy id_app_read on public.id_applications for select to authenticated
  using (public.is_command() or public.can_command_company(company_id));
-- (no insert/update/delete policies: only the functions below and the manage-users Edge Function write)

-- Lists the "Apply for new ID" page needs before anyone is signed in.
create or replace function public.registration_options()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'short_name', short_name) order by display_order)
                             from public.companies where active), '[]'::jsonb),
    'ranks',  (select value from public.app_settings where key = 'ranks'),
    'trades', (select value from public.app_settings where key = 'trades'),
    'unit',   (select value from public.app_settings where key = 'unit'));
$$;

create or replace function public.submit_id_application(p jsonb, p_password text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_snk text := btrim(coalesce(p ->> 'snk_no', ''));
  v_id uuid;
  v_data jsonb := '{}'::jsonb;
  v_key text;
begin
  if v_snk = '' then raise exception 'Personal No is required'; end if;
  if length(v_snk) > 20 then raise exception 'Personal No is too long'; end if;
  if coalesce(p ->> 'name', '') = '' or coalesce(p ->> 'rank', '') = '' then raise exception 'Rank and name are required'; end if;
  if coalesce(p ->> 'category', '') not in ('Offr','JCO','OR') then raise exception 'Category is required'; end if;
  if not exists (select 1 from public.companies where id = nullif(p ->> 'company_id', '')::uuid and active) then raise exception 'Choose your company'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if exists (select 1 from public.soldiers where public.norm_snk(snk_no) = public.norm_snk(v_snk)) then
    raise exception 'Personal No % is already registered in the unit. If you have no login, ask your Coy Comd or the Orderly Room.', v_snk;
  end if;
  if exists (select 1 from public.id_applications where status = 'Pending' and public.norm_snk(snk_no) = public.norm_snk(v_snk)) then
    raise exception 'An application for Personal No % is already waiting for approval', v_snk;
  end if;
  if (select count(*) from public.id_applications where status = 'Pending') >= 300 then
    raise exception 'Too many applications are waiting. Please try again later or contact the Orderly Room.';
  end if;
  foreach v_key in array public.self_editable_fields() loop
    if v_key not in ('category','rank','name') and nullif(p ->> v_key, '') is not null then
      v_data := v_data || jsonb_build_object(v_key, left(p ->> v_key, 500));
    end if;
  end loop;
  insert into public.id_applications (snk_no, category, rank, name, company_id, data, records)
  values (v_snk, p ->> 'category', left(p ->> 'rank', 30), left(p ->> 'name', 120), (p ->> 'company_id')::uuid, v_data,
          coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(p -> 'records', '[]'::jsonb)) r
                     where r ->> 'kind' in ('family','education')), '[]'::jsonb))
  returning id into v_id;
  insert into public.id_application_secrets (application_id, password_hash) values (v_id, crypt(p_password, gen_salt('bf', 10)));
  return v_id;
end;
$$;

-- "Check status" on the login page.
create or replace function public.id_application_status(p_snk text)
returns table(status text, submitted_at timestamptz, review_remarks text)
language sql stable security definer set search_path = public as $$
  select a.status, a.submitted_at, a.review_remarks from public.id_applications a
   where public.norm_snk(a.snk_no) = public.norm_snk(p_snk)
   order by a.submitted_at desc limit 1;
$$;

create or replace function public.reject_id_application(p_id uuid, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_command() then raise exception 'Only the Adjt (or 2IC / CO) can decide ID applications'; end if;
  update public.id_applications set status = 'Rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_remarks = p_remarks
   where id = p_id and status = 'Pending';
  if not found then raise exception 'Application not found or already decided'; end if;
  delete from public.id_application_secrets where application_id = p_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['norm_snk(text)','profile_required_fields()','complete_my_profile(jsonb, jsonb)','reject_id_application(uuid, text)','self_editable_fields()']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['registration_options()','submit_id_application(jsonb, text)','id_application_status(text)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 13. v2.2 — Bn Rep role, automatic training exemption
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','co','2ic','adjt','coy_comd','coy_rep','bn_rep','clk','soldier'));
-- Age 45+ and Med Cat B / C / D are excused from IPFT, RET and Speed March (edit in Settings > Training)
insert into public.app_settings (key, value) values
  ('training_exemption', '{"age":45,"med_cats":["B","C","D"],"tests":["IPFT","RET","SM"]}')
on conflict (key) do nothing;

-- =====================================================================
-- 14. v3.0 — parade states with opening hours, appointment logins,
--     cycle plan, APR / OPR, accommodation,
--     officers' commitments, Group Training "On going"
-- =====================================================================

-- ---------------------------------------------------------------- 14a. parade states
alter table public.parade_states drop constraint if exists parade_states_state_type_check;
alter table public.parade_states alter column state_type set default 'Morning State';
alter table public.parade_states add column if not exists kind text not null default 'Morning';
do $$ begin
  alter table public.parade_states add constraint parade_states_kind_chk check (kind in ('Morning','Second','Extra'));
exception when duplicate_object then null; end $$;
alter table public.parade_states add column if not exists opens_at timestamptz;
alter table public.parade_states add column if not exists closes_at timestamptz;
alter table public.parade_states add column if not exists display_order integer not null default 0;

-- Opening hours (Settings > Parade state). The state for a date opens the evening before.
insert into public.app_settings (key, value) values
  ('parade_windows', '{"open_time":"18:00","morning_close":"03:00","second_close":"15:00","extra_close":"23:59"}')
on conflict (key) do nothing;

-- When the state of a date opens and closes (Bangladesh time).
create or replace function public.parade_window(p_date date, p_kind text)
returns table(opens_at timestamptz, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  with w as (select coalesce((select value from public.app_settings where key = 'parade_windows'), '{}'::jsonb) as v)
  select ((p_date - 1) + coalesce(w.v ->> 'open_time', '18:00')::time) at time zone 'Asia/Dhaka',
         (p_date + coalesce(w.v ->> case p_kind when 'Second' then 'second_close' when 'Extra' then 'extra_close' else 'morning_close' end,
                            case p_kind when 'Second' then '15:00' when 'Extra' then '23:59' else '03:00' end)::time) at time zone 'Asia/Dhaka'
  from w;
$$;

-- Finalizes every state whose closing time has passed (called on use, and every 10 min by pg_cron when enabled).
create or replace function public.auto_close_parade_states()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.coy_submissions cs set status = 'Accepted', reviewed_at = coalesce(cs.reviewed_at, now())
    from public.parade_states ps
   where ps.id = cs.parade_state_id and ps.status = 'Open' and ps.closes_at is not null and ps.closes_at <= now()
     and cs.status <> 'Accepted';
  update public.parade_states set status = 'Finalized', finalized_at = closes_at
   where status = 'Open' and closes_at is not null and closes_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Morning State and 2nd Parade State are created for every day (from 1800 hrs the day before).
create or replace function public.ensure_parade_states(p_date date)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare
  k text;
  v_id uuid;
  v_open timestamptz;
  v_close timestamptz;
  v_master boolean := public.is_parade_master();
begin
  if public.app_role() is null or public.app_role() = 'soldier' then raise exception 'Not permitted'; end if;
  perform public.auto_close_parade_states();
  if p_date > public.bd_today() + 1 then raise exception 'A parade state can be opened at most one day in advance'; end if;
  foreach k in array array['Morning','Second'] loop
    select id into v_id from public.parade_states where date = p_date and kind = k order by created_at limit 1;
    if v_id is null then
      select w.opens_at, w.closes_at into v_open, v_close from public.parade_window(p_date, k) w;
      continue when now() < v_open and not v_master;              -- not open yet
      continue when v_close <= now() and not public.is_command(); -- past: only Adjt / 2IC / CO open it late
      insert into public.parade_states (date, state_type, kind, status, opens_at, closes_at, display_order, created_by)
      values (p_date, case k when 'Morning' then 'Morning State' else '2nd Parade State' end, k, 'Open',
              least(v_open, now()), greatest(v_close, now() + interval '2 hours') , case k when 'Morning' then 1 else 2 end, auth.uid())
      on conflict (date, state_type) do nothing;
    end if;
  end loop;
  for v_id in select id from public.parade_states where date = p_date and status = 'Open' loop
    perform public.sync_parade_state(v_id);
  end loop;
  return query select id from public.parade_states where date = p_date order by display_order, created_at;
end;
$$;
-- Older screens call this: returns the Morning State.
create or replace function public.ensure_parade_state(p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.ensure_parade_states(p_date);
  select id into v_id from public.parade_states where date = p_date order by display_order, created_at limit 1;
  return v_id;
end;
$$;

-- Extra state on requirement (Durbar, Firing, Roll call …) — Adjt / 2IC / CO / Admin / Bn Rep.
create or replace function public.open_extra_state(p_date date, p_name text, p_closes_at timestamptz default null, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_close timestamptz;
begin
  if not public.is_parade_master() then raise exception 'Only Adjt / 2IC / CO or the Bn Rep can open another state'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Give the state a name, e.g. Durbar'; end if;
  if exists (select 1 from public.parade_states where date = p_date and lower(state_type) = lower(btrim(p_name))) then
    raise exception 'A state named "%" already exists for this date', btrim(p_name);
  end if;
  select w.closes_at into v_close from public.parade_window(p_date, 'Extra') w;
  insert into public.parade_states (date, state_type, kind, status, opens_at, closes_at, display_order, created_by)
  values (p_date, left(btrim(p_name), 40), 'Extra', 'Open', now(), greatest(coalesce(p_closes_at, v_close), now() + interval '30 minutes'),
          10 + (select count(*) from public.parade_states where date = p_date), auth.uid())
  returning id into v_id;
  perform public.sync_parade_state(v_id);
  if p_copy_from is not null then perform public.copy_parade_state(p_copy_from, v_id, null); end if;
  return v_id;
end;
$$;

-- Copy every line of one state into another (e.g. Morning State -> 2nd Parade State).
create or replace function public.copy_parade_state(p_from uuid, p_to uuid, p_company uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_c integer; c record;
begin
  if not exists (select 1 from public.parade_states where id = p_to and status = 'Open') then raise exception 'The target state is not open'; end if;
  for c in select co.id from public.companies co where co.active and (p_company is null or co.id = p_company) loop
    continue when not public.parade_entry_editable(p_to, c.id);
    update public.parade_entries t
       set state = f.state, absent_reason = f.absent_reason, employment = f.employment, location = f.location,
           remarks = f.remarks, is_manual = f.is_manual, auto_note = f.auto_note, updated_by = auth.uid()
      from public.parade_entries f
     where f.parade_state_id = p_from and t.parade_state_id = p_to and t.soldier_id = f.soldier_id and t.company_id = c.id;
    get diagnostics v_c = row_count;
    v_n := v_n + v_c;
  end loop;
  return v_n;
end;
$$;

-- Lines can be edited while the state is within its opening hours (Adjt / Bn Rep: until it is finalized).
create or replace function public.parade_entry_editable(p_state_id uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.parade_states ps where ps.id = p_state_id and ps.status = 'Open'
             and (public.is_parade_master() or now() between coalesce(ps.opens_at, '-infinity') and coalesce(ps.closes_at, 'infinity')))
    and public.can_parade_company(p_company)
    and (
      public.is_parade_master()
      or not exists (select 1 from public.coy_submissions cs
                     where cs.parade_state_id = p_state_id and cs.company_id = p_company
                       and cs.status in ('Submitted','Accepted'))
    ), false);
$$;

-- Reopening gives two more hours before it closes again by itself.
create or replace function public.reopen_parade_state(p_state_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_command() then raise exception 'Only Adjt / 2IC / CO can reopen a state'; end if;
  update public.parade_states set status = 'Open', finalized_by = null, finalized_at = null,
         closes_at = greatest(coalesce(closes_at, now()), now() + interval '2 hours')
   where id = p_state_id;
end;
$$;

-- Kept for older screens: returns the 2nd Parade State of the date.
create or replace function public.start_second_state(p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.ensure_parade_states(p_date);
  select id into v_id from public.parade_states where date = p_date and kind = 'Second' limit 1;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- 14b. appointment logins
-- Staff logins belong to the APPOINTMENT (Adjt, Training Clerk, ORS, Rdo Coy Rep …), not to a person.
-- "held_by" only records who is doing the duty; every soldier keeps his own individual login.
alter table public.profiles add column if not exists appointment text;
alter table public.profiles add column if not exists held_by text;
alter table public.profiles add column if not exists held_by_soldier uuid references public.soldiers(id) on delete set null;
create table if not exists public.appointment_holders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  held_by text,
  held_by_soldier uuid references public.soldiers(id) on delete set null,
  from_at timestamptz not null default now(),
  to_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null
);
create index if not exists appointment_holders_profile_idx on public.appointment_holders(profile_id, from_at desc);
alter table public.appointment_holders enable row level security;
drop policy if exists appointment_holders_read on public.appointment_holders;
create policy appointment_holders_read on public.appointment_holders for select to authenticated
  using (public.is_command() or profile_id = auth.uid());

create or replace function public.track_appointment_holder()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> 'soldier' and (tg_op = 'INSERT' or new.held_by is distinct from old.held_by or new.held_by_soldier is distinct from old.held_by_soldier)
     and (new.held_by is not null or new.held_by_soldier is not null) then
    update public.appointment_holders set to_at = now() where profile_id = new.id and to_at is null;
    insert into public.appointment_holders (profile_id, held_by, held_by_soldier, changed_by)
    values (new.id, new.held_by, new.held_by_soldier, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_holder_history on public.profiles;
create trigger profiles_holder_history after insert or update of held_by, held_by_soldier on public.profiles
  for each row execute function public.track_appointment_holder();

-- Leave: an officer's leave goes to Adjt / 2IC / CO; nobody decides the leave of the person holding his own login.
create or replace function public.can_decide_leave(p_company uuid, p_soldier uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (p_soldier is distinct from public.app_soldier())
    and (p_soldier is distinct from (select held_by_soldier from public.profiles where id = auth.uid()))
    and (
      public.is_command()
      or (public.app_role() = 'coy_comd' and p_company = public.app_company()
          and coalesce((select category from public.soldiers where id = p_soldier), 'OR') <> 'Offr')
    ), false);
$$;

-- ---------------------------------------------------------------- 14c. soldier data
alter table public.soldiers add column if not exists accommodation text;
alter table public.soldiers add column if not exists accommodation_details text;
do $$ begin
  alter table public.soldiers add constraint soldiers_accommodation_chk check (accommodation is null or accommodation in ('Snk Lines','Family Quarter','Out Living'));
exception when duplicate_object then null; end $$;

create or replace function public.self_editable_fields()
returns text[] language sql immutable as $$
  select array[
    'category','rank','trade','name','name_bn','platoon','appointment','date_joined_unit','previous_unit',
    'date_of_birth','date_of_enrolment','date_of_rank','retirement_date',
    'height_in','weight_lbs','blood_group','medical_category','medical_remarks',
    'religion','marital_status','date_of_marriage','spouse_name','education','nid_no',
    'home_division','home_district','home_upazila','distance_from_ib_km','permanent_address','present_address',
    'accommodation','accommodation_details',
    'mobile','alt_mobile','email','emergency_name','emergency_relation','emergency_mobile'
  ];
$$;
create or replace function public.profile_required_fields()
returns text[] language sql immutable as $$
  select array['name_bn','date_of_birth','date_of_enrolment','height_in','weight_lbs','blood_group',
    'religion','marital_status','education','nid_no','home_district','home_upazila','distance_from_ib_km',
    'permanent_address','present_address','accommodation','mobile','emergency_name','emergency_relation','emergency_mobile'];
$$;

-- APR (JCO / OR) and OPR (officers) are kept as "report" records on the personal file.
alter table public.soldier_records drop constraint if exists soldier_records_kind_check;
alter table public.soldier_records add constraint soldier_records_kind_check
  check (kind in ('family','education','course','discipline','award','posting','medical','report','vehicle'));

-- Group Training: Completed / On going / Yet to complete.
alter table public.training_records drop constraint if exists training_records_result_check;
alter table public.training_records add constraint training_records_result_check
  check (result in ('Pass','Fail','Exempted','Absent','Ongoing'));

-- ---------------------------------------------------------------- 14d. 4-cycle individual plan
-- The year has 4 cycles of 3 months. The Coy Comd plans, at the start of the year, which cycle each
-- soldier spends on Indl Training, Group Training, Unit Admin and Privilege Leave.
create table if not exists public.cycle_plans (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  year integer not null,
  c1 text, c2 text, c3 text, c4 text,
  remarks text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (soldier_id, year),
  check (coalesce(c1, 'Indl Training') in ('Indl Training','Group Training','Unit Admin','Privilege Leave')),
  check (coalesce(c2, 'Indl Training') in ('Indl Training','Group Training','Unit Admin','Privilege Leave')),
  check (coalesce(c3, 'Indl Training') in ('Indl Training','Group Training','Unit Admin','Privilege Leave')),
  check (coalesce(c4, 'Indl Training') in ('Indl Training','Group Training','Unit Admin','Privilege Leave'))
);
drop trigger if exists cycle_plans_sync_company on public.cycle_plans;
create trigger cycle_plans_sync_company before insert or update of soldier_id, company_id on public.cycle_plans
  for each row execute function public.sync_company_from_soldier();
alter table public.cycle_plans enable row level security;
drop policy if exists cycle_plans_read on public.cycle_plans;
drop policy if exists cycle_plans_write on public.cycle_plans;
create policy cycle_plans_read on public.cycle_plans for select to authenticated
  using (public.can_view_company(company_id) or soldier_id = public.app_soldier());
create policy cycle_plans_write on public.cycle_plans for all to authenticated
  using (public.can_command_company(company_id)) with check (public.can_command_company(company_id));

create or replace function public.soldier_company_cascade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    update public.soldier_records set company_id = new.company_id where soldier_id = new.id;
    update public.profile_change_requests set company_id = new.company_id where soldier_id = new.id;
    update public.leave_applications set company_id = new.company_id where soldier_id = new.id;
    update public.training_records set company_id = new.company_id where soldier_id = new.id;
    update public.course_nominations set company_id = new.company_id where soldier_id = new.id;
    update public.itp_items set company_id = new.company_id where soldier_id = new.id;
    update public.sick_reports set company_id = new.company_id where soldier_id = new.id;
    update public.cycle_plans set company_id = new.company_id where soldier_id = new.id;
    update public.duty_roster set company_id = new.company_id where soldier_id = new.id and date >= public.bd_today();
    update public.profiles set company_id = new.company_id where soldier_id = new.id and role = 'soldier';
    update public.parade_entries e set company_id = new.company_id
      from public.parade_states ps
      where ps.id = e.parade_state_id and ps.status = 'Open' and e.soldier_id = new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 14e. (removed in v3.1)
-- The equipment & weapon register of v3.0 was taken out. If you ran the v3.0 schema, the tables
-- equipment_items and equipment_log are no longer used; drop them yourself if they are empty:
--   drop table if exists public.equipment_log; drop table if exists public.equipment_items;

-- ---------------------------------------------------------------- 14f. officers' commitments
create table if not exists public.officer_commitments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time_from time,
  time_to time,
  soldier_id uuid not null references public.soldiers(id) on delete cascade,
  title text not null,
  venue text,
  remarks text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists officer_commitments_date_idx on public.officer_commitments (date, soldier_id);
alter table public.officer_commitments enable row level security;
drop policy if exists officer_commitments_read on public.officer_commitments;
drop policy if exists officer_commitments_write on public.officer_commitments;
create policy officer_commitments_read on public.officer_commitments for select to authenticated using (public.is_command());
create policy officer_commitments_write on public.officer_commitments for all to authenticated
  using (public.is_command()) with check (public.is_command());

-- ---------------------------------------------------------------- 14g. one-time data changes
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'migration_v3_0') then
    update public.parade_states set state_type = 'Morning State', kind = 'Morning', display_order = 1 where state_type = '1st State';
    update public.parade_states set state_type = '2nd Parade State', kind = 'Second', display_order = 2 where state_type = '2nd State';
    -- staff logins linked to a person become appointment logins; the person's record is freed for his own login
    update public.profiles p
       set held_by = coalesce(p.held_by, s.rank || ' ' || s.name),
           held_by_soldier = coalesce(p.held_by_soldier, p.soldier_id),
           appointment = coalesce(p.appointment, nullif(s.appointment, '')),
           soldier_id = null
      from public.soldiers s
     where s.id = p.soldier_id and p.role <> 'soldier';
    insert into public.app_settings (key, value) values ('migration_v3_0', to_jsonb(now()::text));
  end if;
end $$;

-- Close states automatically every 10 minutes when pg_cron is enabled (Database > Extensions).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ums-close-parade-states', '*/10 * * * *', 'select public.auto_close_parade_states()');
  end if;
exception when others then
  raise notice 'pg_cron not available — parade states close automatically when the system is next used';
end $$;

do $$
declare f text;
begin
  foreach f in array array['parade_window(date, text)','auto_close_parade_states()','ensure_parade_states(date)','ensure_parade_state(date)',
    'open_extra_state(date, text, timestamptz, uuid)','copy_parade_state(uuid, uuid, uuid)','parade_entry_editable(uuid, uuid)',
    'reopen_parade_state(uuid)','start_second_state(date)','can_decide_leave(uuid, uuid)','self_editable_fields()','profile_required_fields()']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- =====================================================================
-- 15. v3.1 — training photos are for officers only
-- =====================================================================
-- "Officer" = CO / 2IC / Adjt / Admin, a Coy Comd, or any login whose own soldier record is an officer.
create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_command() or public.app_role() = 'coy_comd'
      or coalesce((select category = 'Offr' from public.soldiers where id = public.app_soldier()), false);
$$;
grant execute on function public.is_officer() to authenticated;

drop policy if exists training_photos_read on public.training_photos;
drop policy if exists training_photos_write on public.training_photos;
create policy training_photos_read on public.training_photos for select to authenticated
  using (public.is_officer());
create policy training_photos_write on public.training_photos for all to authenticated
  using (public.is_command() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()))
  with check (public.is_command() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()));
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute 'drop policy if exists training_photos_obj_read on storage.objects';
    execute 'drop policy if exists training_photos_obj_write on storage.objects';
    execute 'drop policy if exists training_photos_obj_delete on storage.objects';
    execute $p$create policy training_photos_obj_read on storage.objects for select to authenticated using (
      bucket_id = 'training-photos' and public.is_officer())$p$;
    execute $p$create policy training_photos_obj_write on storage.objects for insert to authenticated with check (
      bucket_id = 'training-photos' and (public.is_command() or public.app_role() = 'coy_comd'))$p$;
    execute $p$create policy training_photos_obj_delete on storage.objects for delete to authenticated using (
      bucket_id = 'training-photos' and (public.is_command() or public.app_role() = 'coy_comd'))$p$;
  end if;
end $$;

-- =====================================================================
-- 16. v3.2 — notice attachments, leave routing, Speed March, officers' tasks, standard units
-- =====================================================================
-- Notices & orders can carry PDF / image files (stored in the private bucket "notice-files").
alter table public.notices add column if not exists attachments jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('notice-files', 'notice-files', false) on conflict (id) do nothing;
    execute 'drop policy if exists notice_files_read on storage.objects';
    execute 'drop policy if exists notice_files_write on storage.objects';
    execute 'drop policy if exists notice_files_delete on storage.objects';
    execute $p$create policy notice_files_read on storage.objects for select to authenticated using (
      bucket_id = 'notice-files' and public.app_role() is not null)$p$;
    execute $p$create policy notice_files_write on storage.objects for insert to authenticated with check (
      bucket_id = 'notice-files' and (public.is_command() or public.app_role() = 'coy_comd'))$p$;
    execute $p$create policy notice_files_delete on storage.objects for delete to authenticated using (
      bucket_id = 'notice-files' and (public.is_command() or public.app_role() = 'coy_comd'))$p$;
  end if;
end $$;

-- Leave: the Coy Comd decides the JCO / OR leave of his coy; BHQ Pl and every officer's leave
-- go to the Adjt (2IC / CO), who can also decide any leave when a Coy Comd is away.
create or replace function public.can_decide_leave(p_company uuid, p_soldier uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (p_soldier is distinct from public.app_soldier())
    and (p_soldier is distinct from (select held_by_soldier from public.profiles where id = auth.uid()))
    and (
      public.is_command()
      or (public.app_role() = 'coy_comd' and p_company = public.app_company()
          and coalesce((select category from public.soldiers where id = p_soldier), 'OR') <> 'Offr'
          and coalesce((select slug from public.companies where id = p_company), '') <> 'bhq')
    ), false);
$$;

-- Speed March: Completed / Yet to complete / Exempted (no pass / fail).
update public.training_types set completion_only = true where code = 'SM' and not completion_only;

-- Standard companies / sub-units (121 BSC added; the demo-era names are updated only if never changed).
insert into public.companies (slug, name, short_name, display_order) values ('121-bsc','121 BSC','121',8)
on conflict (slug) do update set active = true;
update public.companies set name = 'Radio Coy', short_name = 'Radio' where slug = 'rdo' and name = 'Rdo Coy';
update public.companies set name = 'RR & Line Coy', short_name = 'RR & Line' where slug = 'rr' and name = 'RR Coy';
update public.companies set short_name = 'Op' where slug = 'op' and short_name = 'OP';
update public.companies set display_order = 9 where slug = '205-absc' and display_order = 8;
insert into public.app_settings (key, value) values ('officer_appointments', '["Adjt","QM","Coy Comd","2IC","CO"]')
on conflict (key) do nothing;

-- Officers' tasks (responsibilities with a deadline), next to the daily commitments board.
create table if not exists public.officer_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  category text not null default 'Admin',
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  status text not null default 'Pending' check (status in ('Pending','In Progress','Completed','On Hold')),
  deadline date,
  assigned_to uuid[] not null default '{}',
  remarks text,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists officer_tasks_assigned_idx on public.officer_tasks using gin (assigned_to);

create or replace function public.my_soldier_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select array_remove(array[public.app_soldier(), (select held_by_soldier from public.profiles where id = auth.uid())], null);
$$;
grant execute on function public.my_soldier_ids() to authenticated;

create or replace function public.officer_task_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not public.is_command() then
    -- the officer himself may only change the status and remarks of his task
    new.title := old.title; new.details := old.details; new.category := old.category; new.priority := old.priority;
    new.deadline := old.deadline; new.assigned_to := old.assigned_to; new.created_by := old.created_by;
  end if;
  if new.status = 'Completed' and (tg_op = 'INSERT' or old.status is distinct from 'Completed') then new.completed_at := now(); end if;
  if new.status <> 'Completed' then new.completed_at := null; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists officer_tasks_guard on public.officer_tasks;
create trigger officer_tasks_guard before insert or update on public.officer_tasks for each row execute function public.officer_task_guard();

alter table public.officer_tasks enable row level security;
drop policy if exists officer_tasks_read on public.officer_tasks;
drop policy if exists officer_tasks_insert on public.officer_tasks;
drop policy if exists officer_tasks_update on public.officer_tasks;
drop policy if exists officer_tasks_delete on public.officer_tasks;
create policy officer_tasks_read on public.officer_tasks for select to authenticated using (public.is_officer());
create policy officer_tasks_insert on public.officer_tasks for insert to authenticated with check (public.is_command());
create policy officer_tasks_update on public.officer_tasks for update to authenticated
  using (public.is_command() or assigned_to && public.my_soldier_ids())
  with check (public.is_command() or assigned_to && public.my_soldier_ids());
create policy officer_tasks_delete on public.officer_tasks for delete to authenticated using (public.is_command());
grant select, insert, update, delete on public.officer_tasks to authenticated;

-- Officers' daily commitments: every officer sees the board; the Adjt (2IC / CO) keeps it and an officer
-- can add or change his own commitments.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'officer_commitments' loop
    execute format('drop policy if exists %I on public.officer_commitments', p.policyname);
  end loop;
end $$;
create policy officer_commitments_read on public.officer_commitments for select to authenticated using (public.is_officer());
create policy officer_commitments_write on public.officer_commitments for all to authenticated
  using (public.is_command() or soldier_id = any (public.my_soldier_ids()))
  with check (public.is_command() or soldier_id = any (public.my_soldier_ids()));

-- =====================================================================
-- 17. v3.4 — role matrix: the Clerk enters daily commitments, the training calendar and
--     notices on behalf of officers; an individual may request a change to his full information
-- =====================================================================
alter table public.notices add column if not exists issued_by text;  -- "By order of Adjt"

drop policy if exists training_events_write on public.training_events;
create policy training_events_write on public.training_events for all to authenticated
  using (public.is_unit_wide() or (company_id is not null and public.can_command_company(company_id)))
  with check (public.is_unit_wide() or (company_id is not null and public.can_command_company(company_id)));
drop policy if exists programmes_write on public.daily_programmes;
create policy programmes_write on public.daily_programmes for all to authenticated
  using (public.is_unit_wide() or (company_id is not null and public.can_command_company(company_id)))
  with check (public.is_unit_wide() or (company_id is not null and public.can_command_company(company_id)));
drop policy if exists notices_write on public.notices;
create policy notices_write on public.notices for all to authenticated
  using (public.is_unit_wide() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()))
  with check (public.is_unit_wide() or (company_id is not null and public.app_role() = 'coy_comd' and company_id = public.app_company()));
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute 'drop policy if exists notice_files_write on storage.objects';
    execute 'drop policy if exists notice_files_delete on storage.objects';
    execute $p$create policy notice_files_write on storage.objects for insert to authenticated with check (
      bucket_id = 'notice-files' and (public.is_unit_wide() or public.app_role() = 'coy_comd'))$p$;
    execute $p$create policy notice_files_delete on storage.objects for delete to authenticated using (
      bucket_id = 'notice-files' and (public.is_unit_wide() or public.app_role() = 'coy_comd'))$p$;
  end if;
end $$;

-- Fields and file sections an individual may ask to change (approved by his Coy Comd / the Adjt).
-- Not requestable: Personal No (the login ID) and the serving status.
create or replace function public.requestable_fields()
returns text[] language sql immutable as $$
  select public.self_editable_fields() || array['company_id','atts_type','atts_location','atts_from','atts_to','remarks'];
$$;
create or replace function public.requestable_kinds()
returns text[] language sql immutable as $$
  select array['family','education','course','discipline','award','posting','vehicle','report','medical'];
$$;
create or replace function public.review_profile_request(p_id uuid, p_approve boolean, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.profile_change_requests%rowtype;
  v_key text;
  v_val jsonb;
  v_type text;
  v_op jsonb;
  v_kinds text[] := public.requestable_kinds();
begin
  select * into r from public.profile_change_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'Pending' then raise exception 'Request is already %', lower(r.status); end if;
  if not public.can_command_company(r.company_id) then
    raise exception 'Only the Coy Comd (or Adjt / 2IC / CO) can approve profile updates';
  end if;

  if p_approve then
    for v_key, v_val in select * from jsonb_each(r.changes) loop
      if v_key = any(public.requestable_fields()) then
        select format_type(a.atttypid, a.atttypmod) into v_type
          from pg_attribute a
         where a.attrelid = 'public.soldiers'::regclass and a.attname = v_key and not a.attisdropped;
        if v_type is not null then
          execute format('update public.soldiers set %I = $1::%s, updated_by = $3 where id = $2', v_key, v_type)
            using nullif(v_val #>> '{}', ''), r.soldier_id, auth.uid();
        end if;
      end if;
    end loop;

    for v_op in select * from jsonb_array_elements(r.record_ops) loop
      if (v_op ->> 'kind') = any(v_kinds) then
        if v_op ->> 'op' = 'add' then
          insert into public.soldier_records (soldier_id, kind, record_date, data, created_by)
          values (r.soldier_id, v_op ->> 'kind', nullif(v_op ->> 'record_date', '')::date, coalesce(v_op -> 'data', '{}'::jsonb), auth.uid());
        elsif v_op ->> 'op' = 'update' then
          update public.soldier_records
             set data = coalesce(v_op -> 'data', data),
                 record_date = coalesce(nullif(v_op ->> 'record_date', '')::date, record_date)
           where id = (v_op ->> 'id')::uuid and soldier_id = r.soldier_id and kind = v_op ->> 'kind';
        elsif v_op ->> 'op' = 'delete' then
          delete from public.soldier_records
           where id = (v_op ->> 'id')::uuid and soldier_id = r.soldier_id and kind = v_op ->> 'kind';
        end if;
      end if;
    end loop;
  end if;

  update public.profile_change_requests
     set status = case when p_approve then 'Approved' else 'Rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_remarks = p_remarks
   where id = p_id;
end;
$$;
revoke execute on function public.requestable_fields() from public, anon;
revoke execute on function public.requestable_kinds() from public, anon;
grant execute on function public.requestable_fields() to authenticated;
grant execute on function public.requestable_kinds() to authenticated;

-- After running this file, create your first Admin. See supabase/BOOTSTRAP_FIRST_ADMIN.sql
-- ---------------------------------------------------------------------
