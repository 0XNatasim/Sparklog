-- 0165: pictures and screenshots on the notes (V2.4.340).
--
-- Two kinds of notes can carry up to 10 pictures each:
--   * « Mes notes » (manager_notes, 0111): a private note's pictures are seen only by its author; a shared note's by every
--     manager. Only the author adds or removes them.
--   * « Contremaître » (foreman_reports, 0134): the foreman who wrote the note adds / removes them (while his work sheet is
--     still editable, or right after the note was created); every manager reads them and may delete them.
-- Who sees a picture follows the note it belongs to: the policies of note_files and of the bucket ask the table of the note
-- (with its own row-level security), so nothing about who reads a note is copied here.
-- The pictures live in the PRIVATE « note-files » bucket, in the folder of whoever sent them (<uploader id>/<uuid>.jpg), and
-- are opened through signed links that expire. The app re-encodes every picture (EXIF / GPS removed, like the overtime proofs).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-files', 'note-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.note_files (
  id uuid primary key default gen_random_uuid(),
  manager_note_id uuid references public.manager_notes(id) on delete cascade,
  foreman_report_id uuid references public.foreman_reports(id) on delete cascade,
  path text not null unique,
  file_name text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  constraint note_files_one_parent check ((manager_note_id is not null)::int + (foreman_report_id is not null)::int = 1),
  constraint note_files_name_chk check (char_length(btrim(file_name)) between 1 and 200)
);

create index if not exists note_files_manager_note_idx on public.note_files (manager_note_id) where manager_note_id is not null;
create index if not exists note_files_foreman_report_idx on public.note_files (foreman_report_id) where foreman_report_id is not null;

-- Server-owned fields; the object sits in the sender's folder; at most 10 pictures per note.
create or replace function public.note_files_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.uploaded_by := auth.uid();
  new.uploaded_at := now();
  if new.path not like auth.uid()::text || '/%' then
    raise exception using errcode = '23514', message = 'note_file_path';
  end if;
  if (select count(*) from public.note_files f
       where f.manager_note_id is not distinct from new.manager_note_id
         and f.foreman_report_id is not distinct from new.foreman_report_id) >= 10 then
    raise exception using errcode = '23514', message = 'note_files_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists note_files_guard on public.note_files;
create trigger note_files_guard before insert on public.note_files
  for each row execute function public.note_files_guard();
revoke all on function public.note_files_guard() from public, anon, authenticated;

alter table public.note_files enable row level security;

drop policy if exists "note_files: read" on public.note_files;
drop policy if exists "note_files: insert" on public.note_files;
drop policy if exists "note_files: delete" on public.note_files;

-- Read: whoever can read the note (the subselects run under the row-level security of the notes' own tables).
create policy "note_files: read" on public.note_files for select to authenticated
  using (
    (manager_note_id is not null and exists (select 1 from public.manager_notes n where n.id = note_files.manager_note_id))
    or (foreman_report_id is not null and exists (select 1 from public.foreman_reports r where r.id = note_files.foreman_report_id))
  );

-- Insert: the author of a manager note; the foreman author of a foreman note while the sheet is editable (or just after the
-- note was written: the note is sent right after the sheet, which may already be submitted).
create policy "note_files: insert" on public.note_files for insert to authenticated
  with check (
    (manager_note_id is not null and public.get_my_role() = 'manager'
      and exists (select 1 from public.manager_notes n where n.id = note_files.manager_note_id and n.user_id = auth.uid()))
    or (foreman_report_id is not null
      and exists (
        select 1 from public.foreman_reports r left join public.jobs j on j.id = r.job_id
        where r.id = note_files.foreman_report_id and r.user_id = auth.uid()
          and (j.status in ('saved', 'updated') or r.created_at > now() - interval '15 minutes')))
  );

-- Delete: the sender (a foreman's only while his sheet is editable) and, for a foreman note, any manager.
create policy "note_files: delete" on public.note_files for delete to authenticated
  using (
    (uploaded_by = auth.uid() and manager_note_id is not null)
    or (foreman_report_id is not null and (
      public.get_my_role() = 'manager'
      or (uploaded_by = auth.uid() and exists (
        select 1 from public.foreman_reports r join public.jobs j on j.id = r.job_id
        where r.id = note_files.foreman_report_id and j.status in ('saved', 'updated')))))
  );

-- A row is never edited: a wrong picture is removed and added again.
revoke all on public.note_files from anon, public, authenticated;
grant select, insert, delete on public.note_files to authenticated;

-- The bucket: the sender writes in his own folder; a picture is read by whoever may read its row (or its sender);
-- the sender removes his own objects, and a manager those of a foreman note (the note is deleted with its pictures).
drop policy if exists "note files storage: insert own folder" on storage.objects;
drop policy if exists "note files storage: read" on storage.objects;
drop policy if exists "note files storage: delete" on storage.objects;

create policy "note files storage: insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-files' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "note files storage: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'note-files' and (
      (storage.foldername(objects.name))[1] = (auth.uid())::text
      or exists (select 1 from public.note_files f where f.path = objects.name)
    )
  );

create policy "note files storage: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'note-files' and (
      (storage.foldername(objects.name))[1] = (auth.uid())::text
      or (public.get_my_role() = 'manager'
        and exists (select 1 from public.note_files f where f.path = objects.name and f.foreman_report_id is not null))
    )
  );
