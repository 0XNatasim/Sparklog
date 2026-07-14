-- CCQ competency card per employee: the image lives in a private storage
-- bucket and the expiry date on the profile, so the app can flag cards that
-- need to be renewed.
alter table public.profiles
  add column if not exists ccq_card_path   text,
  add column if not exists ccq_card_expiry date;

-- Private bucket for the card images (paths are "<profile_id>/ccq-card.<ext>")
insert into storage.buckets (id, name, public)
values ('ccq-cards', 'ccq-cards', false)
on conflict (id) do nothing;

-- Managers manage every card; employees can view their own.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'ccq cards: manager all'
  ) then
    create policy "ccq cards: manager all"
      on storage.objects for all
      using (bucket_id = 'ccq-cards' and public.get_my_role() = 'manager')
      with check (bucket_id = 'ccq-cards' and public.get_my_role() = 'manager');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'ccq cards: own read'
  ) then
    create policy "ccq cards: own read"
      on storage.objects for select
      using (bucket_id = 'ccq-cards' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
