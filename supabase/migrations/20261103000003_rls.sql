-- Row-level security: permissions are enforced by the database, not only the UI.

alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.bills        enable row level security;
alter table public.bill_items   enable row level security;
alter table public.audit_log    enable row level security;

-- Table privileges (RLS then filters rows). anon gets nothing.
-- Supabase grants everything to anon/authenticated by default, so start from nothing.
revoke all on public.profiles, public.app_settings, public.bills, public.bill_items, public.audit_log, public.entries
  from anon, authenticated;
grant select, update            on public.profiles     to authenticated;
grant select, update            on public.app_settings to authenticated;
grant select, insert, update, delete on public.bills      to authenticated;
grant select, insert, update, delete on public.bill_items to authenticated;
grant select                    on public.audit_log    to authenticated;
grant select                    on public.entries      to authenticated;

grant execute on function public.is_admin()           to authenticated;
grant execute on function public.users_can_view_all() to authenticated;
grant execute on function public.signup_open()        to anon, authenticated;

-- ---------- profiles ----------
drop policy if exists "profiles: signed-in users can read" on public.profiles;
create policy "profiles: signed-in users can read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- (role/email changes by non-admins are blocked by the guard_profile_update trigger)

-- ---------- app_settings ----------
drop policy if exists "settings: signed-in users can read" on public.app_settings;
create policy "settings: signed-in users can read" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "settings: admin can update" on public.app_settings;
create policy "settings: admin can update" on public.app_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- bills ----------
drop policy if exists "bills: read" on public.bills;
create policy "bills: read" on public.bills
  for select to authenticated
  using (
    logged_by = (select auth.uid())
    or (select public.is_admin())
    or (select public.users_can_view_all())
  );

drop policy if exists "bills: insert as self" on public.bills;
create policy "bills: insert as self" on public.bills
  for insert to authenticated
  with check (logged_by = (select auth.uid()));

drop policy if exists "bills: update own or admin" on public.bills;
create policy "bills: update own or admin" on public.bills
  for update to authenticated
  using (logged_by = (select auth.uid()) or (select public.is_admin()))
  with check (logged_by = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "bills: delete own or admin" on public.bills;
create policy "bills: delete own or admin" on public.bills
  for delete to authenticated
  using (logged_by = (select auth.uid()) or (select public.is_admin()));

-- ---------- bill_items (permissions follow the parent bill) ----------
drop policy if exists "items: read" on public.bill_items;
create policy "items: read" on public.bill_items
  for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id));  -- bills RLS applies inside

drop policy if exists "items: insert own bill or admin" on public.bill_items;
create policy "items: insert own bill or admin" on public.bill_items
  for insert to authenticated
  with check (exists (
    select 1 from public.bills b
    where b.id = bill_id and (b.logged_by = (select auth.uid()) or (select public.is_admin()))
  ));

drop policy if exists "items: update own bill or admin" on public.bill_items;
create policy "items: update own bill or admin" on public.bill_items
  for update to authenticated
  using (exists (
    select 1 from public.bills b
    where b.id = bill_id and (b.logged_by = (select auth.uid()) or (select public.is_admin()))
  ))
  with check (exists (
    select 1 from public.bills b
    where b.id = bill_id and (b.logged_by = (select auth.uid()) or (select public.is_admin()))
  ));

drop policy if exists "items: delete own bill or admin" on public.bill_items;
create policy "items: delete own bill or admin" on public.bill_items
  for delete to authenticated
  using (exists (
    select 1 from public.bills b
    where b.id = bill_id and (b.logged_by = (select auth.uid()) or (select public.is_admin()))
  ));

-- ---------- audit_log (admins read; rows are written by security-definer functions only) ----------
drop policy if exists "audit: admin can read" on public.audit_log;
create policy "audit: admin can read" on public.audit_log
  for select to authenticated using ((select public.is_admin()));
