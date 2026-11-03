-- Helper functions and auth triggers

create schema if not exists private;

-- Is the current user an admin? (security definer avoids RLS recursion on profiles)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Can regular users see everybody's entries?
create or replace function public.users_can_view_all()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select users_view_all from public.app_settings where id = 1), true);
$$;

-- Shown on the login screen: is self sign-up open? (true only before the first account exists,
-- or when an admin has turned on public sign-up)
create or replace function public.signup_open()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles)
      or coalesce((select allow_public_signup from public.app_settings where id = 1), false);
$$;

-- Create a profile for every new auth user. The very first user becomes admin.
-- After that, sign-up is blocked unless the user was created by an admin
-- (app_metadata.provisioned = true) or public sign-up is enabled.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := 'user';
begin
  -- serialise concurrent sign-ups so only one user can become the first admin
  perform pg_advisory_xact_lock(hashtext('pharmacy_bill_log_new_user'));

  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
  elsif coalesce(new.raw_app_meta_data ->> 'provisioned', '') <> 'true'
        and not coalesce((select allow_public_signup from public.app_settings where id = 1), false) then
    raise exception 'Sign-up is closed. Ask an admin to add your account.'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    v_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profiles.email in sync when a user changes their email
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- Guard profile updates: only admins change roles/emails, and there is always one admin left.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile id cannot change' using errcode = '42501';
  end if;

  -- auth.uid() is null for the service role / database owner (trusted server code)
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change roles' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email is managed by sign-in settings' using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'At least one admin is required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();
