-- 0123: files, pictures and documents on an accident file (V2.4.200).
--
-- Managers (owner / manager, manager-level session — two-factor, 0103) attach pictures, PDFs and office
-- documents to a file of the accident register (0120): photos of the scene, the medical certificate, the CNESST
-- forms. The files live in the PRIVATE « accident-files » bucket (nobody else can read it: no employee, no
-- recipient policy, unlike the broadcast pictures) and are listed in accident_files. Each file is opened through a
-- signed link that expires. Adding and removing a file is written to audit_log. Health information: never copy a
-- file or its name into the repository.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accident-files', 'accident-files', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'
]::text[])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "accident files storage: managers" on storage.objects;
create policy "accident files storage: managers" on storage.objects for all to authenticated
  using (bucket_id = 'accident-files' and public.get_my_role() = 'manager')
  with check (bucket_id = 'accident-files' and public.get_my_role() = 'manager');

create table if not exists public.accident_files (
  id uuid primary key default gen_random_uuid(),
  accident_id uuid not null references public.accident_log(id) on delete cascade,
  path text not null unique,
  name text not null,
  kind text not null check (kind in ('image', 'document')),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  constraint accident_files_name_chk check (char_length(btrim(name)) between 1 and 200),
  -- The object sits in the folder of its accident: <accident id>/<uuid>.<ext>.
  constraint accident_files_path_chk check (path like accident_id::text || '/%')
);

create index if not exists accident_files_accident_idx on public.accident_files (accident_id, uploaded_at);

-- Server-owned fields, and at most 20 files on one accident file.
create or replace function public.accident_files_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.uploaded_by := auth.uid();
  new.uploaded_at := now();
  if (select count(*) from public.accident_files f where f.accident_id = new.accident_id) >= 20 then
    raise exception using errcode = '23514', message = 'accident_files_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists accident_files_guard on public.accident_files;
create trigger accident_files_guard before insert on public.accident_files
  for each row execute function public.accident_files_guard();

create or replace function public.accident_files_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  acc public.accident_log%rowtype;
  row_data public.accident_files%rowtype;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  select * into acc from public.accident_log where id = row_data.accident_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
  values (auth.uid(), public.audit_actor_name(auth.uid()),
          case when tg_op = 'DELETE' then 'accident_file_removed' else 'accident_file_added' end,
          acc.employee_id, coalesce(acc.person_name, ''),
          jsonb_build_object('occurred_on', acc.occurred_on, 'accident_id', row_data.accident_id, 'kind', row_data.kind));
  return null;
end;
$$;

drop trigger if exists accident_files_audit on public.accident_files;
create trigger accident_files_audit after insert or delete on public.accident_files
  for each row execute function public.accident_files_audit();

revoke all on function public.accident_files_guard() from public, anon, authenticated;
revoke all on function public.accident_files_audit() from public, anon, authenticated;

alter table public.accident_files enable row level security;

drop policy if exists "accident_files: managers read" on public.accident_files;
drop policy if exists "accident_files: managers insert" on public.accident_files;
drop policy if exists "accident_files: managers delete" on public.accident_files;

create policy "accident_files: managers read" on public.accident_files
  for select to authenticated using (public.get_my_role() = 'manager');
create policy "accident_files: managers insert" on public.accident_files
  for insert to authenticated with check (public.get_my_role() = 'manager');
create policy "accident_files: managers delete" on public.accident_files
  for delete to authenticated using (public.get_my_role() = 'manager');

-- A row is never edited: a wrong file is removed and added again.
revoke all on public.accident_files from anon, public, authenticated;
grant select, insert, delete on public.accident_files to authenticated;
