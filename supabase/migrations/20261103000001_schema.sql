-- Pharmacy Bill Log: core tables
create extension if not exists pgcrypto;

-- One row per signed-up user (id = auth.users.id)
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  role        text not null default 'user' check (role in ('admin', 'user')),
  created_at  timestamptz not null default now()
);

-- App-wide settings (exactly one row, id = 1)
create table if not exists public.app_settings (
  id                   int primary key default 1 check (id = 1),
  users_view_all       boolean not null default true,   -- true: users see all entries, false: only their own
  allow_public_signup  boolean not null default false,  -- false: only the first user (admin) can self sign-up
  updated_at           timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.bills (
  id          uuid primary key default gen_random_uuid(),
  bill_date   date not null,
  image_url   text,                        -- storage path inside the "bill-images" bucket
  logged_by   uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  logged_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bills_bill_date_idx on public.bills (bill_date desc);
create index if not exists bills_logged_by_idx on public.bills (logged_by);
create index if not exists bills_logged_at_idx on public.bills (logged_at desc);

create table if not exists public.bill_items (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.bills (id) on delete cascade,
  serial_no     int,
  item_name     text not null check (length(trim(item_name)) > 0),
  qty           numeric(12, 3),
  rate          numeric(12, 2),
  total_amount  numeric(14, 2)
);
create index if not exists bill_items_bill_id_idx on public.bill_items (bill_id);
create index if not exists bill_items_item_name_idx on public.bill_items (lower(item_name));

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

-- Flat view used by the Summary and Reports screens.
-- security_invoker = true means the caller's row-level security applies.
create or replace view public.entries
with (security_invoker = true) as
select
  i.id            as item_id,
  i.bill_id,
  i.serial_no,
  i.item_name,
  i.qty,
  i.rate,
  i.total_amount,
  b.bill_date,
  b.logged_at,
  b.logged_by,
  p.name          as logged_by_name,
  p.email         as logged_by_email
from public.bill_items i
join public.bills b on b.id = i.bill_id
left join public.profiles p on p.id = b.logged_by;
