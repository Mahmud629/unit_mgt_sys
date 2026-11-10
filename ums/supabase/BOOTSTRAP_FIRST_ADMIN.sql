-- =====================================================================
-- CREATE THE FIRST ADMIN ACCOUNT
-- =====================================================================
-- Step 1. Supabase Dashboard > Authentication > Users > Add user > Create new user
--         Email:    <your personal no, lower case, no spaces>@5sigbn.local
--                   e.g. Personal No "BA 11108"  ->  ba11108@5sigbn.local
--         Password: a strong password
--         Tick "Auto Confirm User".
--
-- Step 2. Replace the email below and run this in the SQL Editor.
-- =====================================================================

update public.profiles
   set role = 'admin',
       active = true,
       company_id = null,
       full_name = 'Capt Asif Mahmud',
       must_change_password = false
 where id = (select id from auth.users where email = 'ba11108@5sigbn.local');

-- Optional: once your own soldier record exists in the Soldiers database,
-- link your login to it so "My Profile" works for you too:
--
-- update public.profiles
--    set soldier_id = (select id from public.soldiers where snk_no = 'BA 11108')
--  where id = (select id from auth.users where email = 'ba11108@5sigbn.local');

-- Check:
select p.full_name, p.role, p.active, u.email
  from public.profiles p join auth.users u on u.id = p.id;
