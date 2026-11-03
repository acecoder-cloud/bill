-- Tests for sign-up rules, row-level security, transactional save, and audit log.
-- Run against a database where supabase_shim.sql + all migrations have been applied.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;

create or replace function pg_temp.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;

-- Expect a statement to fail
create or replace function pg_temp.fails(p_sql text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (blocked: %)', p_name, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded but should have failed)', p_name;
end $$;

begin;
-- ===== Sign-up rules =====
select pg_temp.check(public.signup_open(), 'sign-up is open before any account exists');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.com', '{"name":"Asha Admin"}');
select pg_temp.check((select role from public.profiles where email = 'admin@test.com') = 'admin', 'first account becomes admin');
select pg_temp.check((select name from public.profiles where email = 'admin@test.com') = 'Asha Admin', 'name taken from sign-up metadata');
select pg_temp.check(not public.signup_open(), 'sign-up closes after the first account');
select pg_temp.fails($q$ insert into auth.users (email) values ('stranger@test.com') $q$, 'self sign-up blocked after first account');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.com', '{"provisioned":true}'),
  ('00000000-0000-0000-0000-00000000000c', 'cara@test.com', '{"provisioned":true}');
select pg_temp.check((select role from public.profiles where email = 'bob@test.com') = 'user', 'admin-created account is a regular user');
select pg_temp.check((select name from public.profiles where email = 'bob@test.com') = 'bob', 'name defaults to email prefix');

-- ===== Profiles / roles =====
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.profiles) = 3, 'users can read all profiles (for "logged by" names)');
select pg_temp.fails($q$ update public.profiles set role = 'admin' where id = auth.uid() $q$, 'user cannot make themselves admin');
update public.profiles set name = 'Bob B' where id = auth.uid();
select pg_temp.check((select name from public.profiles where id = auth.uid()) = 'Bob B', 'user can rename themselves');
update public.profiles set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'cara', 'user cannot rename someone else');
update public.app_settings set users_view_all = false;
select pg_temp.check((select users_view_all from public.app_settings) = true, 'user cannot change settings');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select role from public.profiles where email = 'cara@test.com') = 'admin', 'admin can promote a user');
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.fails($q$ update public.profiles set role = 'user' where id = auth.uid() $q$, 'last admin cannot be demoted');
reset role;

-- ===== Bills: save in one transaction =====
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_bill(null, '2026-10-01', '00000000-0000-0000-0000-00000000000b/x.jpg',
  '[{"serial_no":1,"item_name":"Paracetamol 500","qty":2,"rate":15.5,"total_amount":31},
    {"item_name":"Cough syrup","qty":"1","rate":"85","total_amount":"85"}]'::jsonb) as bob_bill \gset
select pg_temp.check((select count(*) from public.bill_items where bill_id = :'bob_bill') = 2, 'save_bill stores the bill and all items');
select pg_temp.check((select serial_no from public.bill_items where item_name = 'Cough syrup') = 2, 'missing serial no. defaults to row order');
select pg_temp.check((select logged_by from public.bills where id = :'bob_bill') = auth.uid(), 'logged_by is the signed-in user');
select pg_temp.fails($q$ select public.save_bill(null, '2026-10-01', null, '[{"item_name":"A","qty":1},{"item_name":"  "}]') $q$, 'blank item name rejects the whole save');
select pg_temp.check((select count(*) from public.bills) = 1, 'failed save left nothing behind (transaction)');
select pg_temp.fails($q$ select public.save_bill(null, '2026-10-01', null, '[{"item_name":"A","qty":"abc"}]') $q$, 'non-numeric qty rejected');
select pg_temp.fails($q$ insert into public.bills (bill_date, logged_by) values ('2026-10-01', '00000000-0000-0000-0000-00000000000c') $q$, 'cannot log a bill as someone else');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select public.save_bill(null, '2026-10-02', null, '[{"item_name":"Bandage","qty":3,"rate":10,"total_amount":30}]'::jsonb) as cara_bill \gset
select pg_temp.check((select count(*) from public.bills) = 2, 'users see all bills when "view all" is on');
select pg_temp.check((select count(*) from public.entries) = 3, 'entries view returns all visible items');
select pg_temp.fails(format($q$ select public.save_bill(%L, '2026-10-05', null, '[{"item_name":"Edited"}]') $q$, :'bob_bill'), 'user cannot edit another user''s bill');
select pg_temp.fails(format($q$ select public.delete_bill(%L) $q$, :'bob_bill'), 'user cannot delete another user''s bill');
update public.bill_items set item_name = 'X' where bill_id = :'bob_bill';
select pg_temp.check((select count(*) from public.bill_items where item_name = 'X') = 0, 'user cannot edit another user''s items directly');
select pg_temp.fails(format($q$ insert into public.bill_items (bill_id, item_name) values (%L, 'Sneaky') $q$, :'bob_bill'), 'user cannot add items to another user''s bill');
select pg_temp.check((select count(*) from public.audit_log) = 0, 'regular users cannot read the audit log');
reset role;

-- "own only" mode
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update public.app_settings set users_view_all = false;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.bills) = 1, 'users see only their own bills when "view all" is off');
select pg_temp.check((select count(*) from public.entries) = 1, 'entries view respects "own only"');
reset role;

-- Admin powers
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.bills) = 2, 'admin sees all bills');
select public.save_bill(:'bob_bill', '2026-10-03', null, '[{"item_name":"Paracetamol 650","qty":1,"rate":20,"total_amount":20}]'::jsonb);
select pg_temp.check((select bill_date from public.bills where id = :'bob_bill') = '2026-10-03', 'admin can edit any bill');
select pg_temp.check((select count(*) from public.bill_items where bill_id = :'bob_bill') = 1, 'edit replaces items');
select pg_temp.check((select logged_by from public.bills where id = :'bob_bill') = '00000000-0000-0000-0000-00000000000b', 'edit keeps the original logger');
select pg_temp.check((select image_url from public.bills where id = :'bob_bill') = '00000000-0000-0000-0000-00000000000b/x.jpg', 'edit keeps the photo');
select pg_temp.check(public.delete_bill(:'cara_bill') is null, 'admin can delete any bill');
select pg_temp.check((select count(*) from public.bill_items where bill_id = :'cara_bill') = 0, 'items deleted with bill');
select pg_temp.check((select count(*) from public.audit_log where action = 'bill.create') = 2, 'audit: creates logged');
select pg_temp.check((select count(*) from public.audit_log where action = 'bill.update'
  and old_value -> 'items' -> 0 ->> 'item_name' = 'Paracetamol 500'
  and new_value -> 'items' -> 0 ->> 'item_name' = 'Paracetamol 650') = 1, 'audit: update stores old and new values');
select pg_temp.check((select count(*) from public.audit_log where action = 'bill.delete' and new_value is null) = 1, 'audit: delete logged');
select pg_temp.check((select count(*) from public.audit_log where action = 'user.role_change') = 2, 'audit: role changes logged');
select pg_temp.check((select count(*) from public.audit_log where action = 'settings.update') = 1, 'audit: settings changes logged');
select pg_temp.fails($q$ insert into public.audit_log (action) values ('forged') $q$, 'nobody can write audit rows directly');
select pg_temp.fails($q$ delete from public.audit_log $q$, 'audit log cannot be deleted, even by admin');
reset role;

-- ===== Storage =====
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into storage.objects (bucket_id, name) values ('bill-images', '00000000-0000-0000-0000-00000000000b/a.jpg');
select pg_temp.fails($q$ insert into storage.objects (bucket_id, name) values ('bill-images', '00000000-0000-0000-0000-00000000000c/a.jpg') $q$, 'cannot upload into someone else''s folder');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from storage.objects) = 0, 'other users'' photos hidden in "own only" mode');
reset role;

-- ===== Anonymous =====
select pg_temp.act_as(null);
select pg_temp.fails($q$ select * from public.bills $q$, 'anonymous visitors cannot read bills');
select pg_temp.check(not public.signup_open(), 'anonymous can check whether sign-up is open');
reset role;

rollback;
\o
\echo 'ALL DATABASE TESTS PASSED'
