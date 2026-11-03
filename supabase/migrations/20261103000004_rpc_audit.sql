-- Transactional save/delete functions and the audit trail.

-- Writes one audit row as the current user. Lives in the non-exposed "private" schema.
create or replace function private.write_audit(p_action text, p_entity_id uuid, p_old jsonb, p_new jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (user_id, action, entity_id, old_value, new_value)
  values (auth.uid(), p_action, p_entity_id, p_old, p_new);
$$;
revoke all on function private.write_audit(text, uuid, jsonb, jsonb) from public;
grant usage on schema private to authenticated;
grant execute on function private.write_audit(text, uuid, jsonb, jsonb) to authenticated;

-- Bill + items as JSON (runs with the caller's RLS, so returns null when not visible)
create or replace function public.bill_snapshot(p_bill_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'bill_date', b.bill_date,
    'image_url', b.image_url,
    'logged_by', b.logged_by,
    'logged_at', b.logged_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'serial_no', i.serial_no, 'item_name', i.item_name,
        'qty', i.qty, 'rate', i.rate, 'total_amount', i.total_amount
      ) order by i.serial_no nulls last, i.id)
      from public.bill_items i where i.bill_id = b.id
    ), '[]'::jsonb)
  )
  from public.bills b where b.id = p_bill_id;
$$;

-- Create (p_bill_id = null) or replace a bill and all of its items in ONE transaction.
-- security invoker: row-level security decides whether the caller may do this.
create or replace function public.save_bill(
  p_bill_id   uuid,
  p_bill_date date,
  p_image_url text,
  p_items     jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id     uuid;
  v_old    jsonb;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in' using errcode = '28000';
  end if;
  if p_bill_date is null then
    raise exception 'Bill date is required' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where length(trim(coalesce(e ->> 'item_name', ''))) = 0
  ) then
    raise exception 'Every row needs an item name' using errcode = '22023';
  end if;

  if p_bill_id is null then
    insert into public.bills (bill_date, image_url, logged_by)
    values (p_bill_date, nullif(p_image_url, ''), auth.uid())
    returning id into v_id;
    v_action := 'bill.create';
  else
    v_old := public.bill_snapshot(p_bill_id);
    if v_old is null then
      raise exception 'Bill not found' using errcode = 'P0002';
    end if;

    update public.bills
       set bill_date  = p_bill_date,
           image_url  = coalesce(nullif(p_image_url, ''), image_url),
           updated_at = now()
     where id = p_bill_id
    returning id into v_id;

    if v_id is null then
      raise exception 'You can only edit your own bills' using errcode = '42501';
    end if;

    delete from public.bill_items where bill_id = v_id;
    v_action := 'bill.update';
  end if;

  insert into public.bill_items (bill_id, serial_no, item_name, qty, rate, total_amount)
  select
    v_id,
    coalesce(nullif(e ->> 'serial_no', '')::numeric::int, ord::int),
    trim(e ->> 'item_name'),
    nullif(e ->> 'qty', '')::numeric,
    nullif(e ->> 'rate', '')::numeric,
    nullif(e ->> 'total_amount', '')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  order by ord;

  perform private.write_audit(v_action, v_id, v_old, public.bill_snapshot(v_id));
  return v_id;
end;
$$;

-- Delete a bill (items cascade). Returns the image path so the app can remove the photo.
create or replace function public.delete_bill(p_bill_id uuid)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_old   jsonb;
  v_image text;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in' using errcode = '28000';
  end if;

  v_old := public.bill_snapshot(p_bill_id);
  if v_old is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  delete from public.bills where id = p_bill_id returning image_url into v_image;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'You can only delete your own bills' using errcode = '42501';
  end if;

  perform private.write_audit('bill.delete', p_bill_id, v_old, null);
  return v_image;
end;
$$;

revoke all on function public.save_bill(uuid, date, text, jsonb) from public, anon;
revoke all on function public.delete_bill(uuid) from public, anon;
revoke all on function public.bill_snapshot(uuid) from public, anon;
grant execute on function public.save_bill(uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_bill(uuid) to authenticated;
grant execute on function public.bill_snapshot(uuid) to authenticated;

-- Audit role changes and settings changes automatically
create or replace function private.audit_profile_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform private.write_audit('user.role_change', new.id,
      jsonb_build_object('role', old.role, 'email', old.email),
      jsonb_build_object('role', new.role, 'email', new.email));
  end if;
  if new.name is distinct from old.name then
    perform private.write_audit('user.rename', new.id,
      jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_change on public.profiles;
create trigger audit_profile_change
  after update on public.profiles
  for each row execute function private.audit_profile_change();

create or replace function private.audit_settings_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.write_audit('settings.update', null,
    to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at');
  return new;
end;
$$;

drop trigger if exists audit_settings_change on public.app_settings;
create trigger audit_settings_change
  after update on public.app_settings
  for each row execute function private.audit_settings_change();
