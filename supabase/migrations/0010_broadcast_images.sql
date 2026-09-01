-- Allow a manager broadcast to carry an image (e.g. a screenshot).

alter table public.manager_broadcasts
  add column if not exists image_path text;

insert into storage.buckets (id, name, public) values
  ('broadcast-images', 'broadcast-images', false)
on conflict (id) do nothing;

-- Managers upload/manage; any signed-in user (a recipient) can read so the
-- popup can build a signed URL.
drop policy if exists "broadcast images: manager all" on storage.objects;
create policy "broadcast images: manager all" on storage.objects for all to authenticated
  using (bucket_id = 'broadcast-images' and public.get_my_role() = 'manager')
  with check (bucket_id = 'broadcast-images' and public.get_my_role() = 'manager');

drop policy if exists "broadcast images: authenticated read" on storage.objects;
create policy "broadcast images: authenticated read" on storage.objects for select to authenticated
  using (bucket_id = 'broadcast-images');
