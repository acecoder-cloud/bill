-- Private storage bucket for bill photos. Files live at "<user id>/<random>.jpg".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bill-images', 'bill-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bill images: upload to own folder" on storage.objects;
create policy "bill images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bill-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "bill images: read" on storage.objects;
create policy "bill images: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bill-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or (select public.users_can_view_all())
    )
  );

drop policy if exists "bill images: delete own or admin" on storage.objects;
create policy "bill images: delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bill-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );
