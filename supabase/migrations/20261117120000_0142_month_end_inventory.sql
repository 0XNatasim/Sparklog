-- 0142: month-end subcontractor inventory (V2.4.267, Phase 8).
--
-- Each month the people who run a warehouse fill in the « Inventaire de fin de mois » Microsoft form, which Sparklog
-- cannot read. A manager schedules the day in Inventaire; the chosen employees must then give 5 to 10 screenshots of the
-- filled form (the proof), and until they do the database refuses to SUBMIT their work sheets dated on or after that day
-- (a sheet can always be saved as a draft). Managers see who gave the proof, download the pictures, and may waive a request.
-- The pictures live in the PRIVATE « month-end-inventory » bucket and are deleted after `retention_days` (60 by default,
-- 7-365, changed in Inventaire). Nothing personal is stored beyond the pictures: no names, no amounts.

-- ── Storage ───────────────────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('month-end-inventory', 'month-end-inventory', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- An employee uploads only into their own folder <user id>/<request id>/<uuid>.jpg; managers read and remove.
drop policy if exists "month end inventory storage: employee upload" on storage.objects;
create policy "month end inventory storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'month-end-inventory' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "month end inventory storage: employee remove" on storage.objects;
create policy "month end inventory storage: employee remove" on storage.objects for delete to authenticated
  using (bucket_id = 'month-end-inventory' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "month end inventory storage: manager all" on storage.objects;
create policy "month end inventory storage: manager all" on storage.objects for all to authenticated
  using (bucket_id = 'month-end-inventory' and public.get_my_role() = 'manager')
  with check (bucket_id = 'month-end-inventory' and public.get_my_role() = 'manager');

-- ── Tables ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.month_end_inventory_settings (
  id boolean primary key default true check (id),
  retention_days integer not null default 60 check (retention_days between 7 and 365),
  updated_at timestamptz not null default now()
);
insert into public.month_end_inventory_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.month_end_inventory_rounds (
  id uuid primary key default gen_random_uuid(),
  due_date date not null unique,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.month_end_inventory_requests (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.month_end_inventory_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz,
  waived_at timestamptz,
  waived_by uuid,
  waive_reason text check (waive_reason is null or char_length(waive_reason) <= 300),
  created_at timestamptz not null default now(),
  unique (round_id, user_id),
  constraint month_end_inventory_one_outcome check (not (submitted_at is not null and waived_at is not null))
);
create index if not exists month_end_inventory_requests_user_pending_idx
  on public.month_end_inventory_requests (user_id) where submitted_at is null and waived_at is null;

create table if not exists public.month_end_inventory_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.month_end_inventory_requests(id) on delete cascade,
  user_id uuid not null,
  storage_path text unique,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  purged_at timestamptz,
  constraint month_end_inventory_files_path_chk check (storage_path is not null or purged_at is not null)
);
create index if not exists month_end_inventory_files_request_idx on public.month_end_inventory_files (request_id, uploaded_at);
create index if not exists month_end_inventory_files_expiry_idx on public.month_end_inventory_files (expires_at) where purged_at is null;

alter table public.month_end_inventory_settings enable row level security;
alter table public.month_end_inventory_rounds enable row level security;
alter table public.month_end_inventory_requests enable row level security;
alter table public.month_end_inventory_files enable row level security;

-- Managers read; every write goes through the functions below (no insert / update / delete grant).
drop policy if exists "month_end_inventory_settings: managers read" on public.month_end_inventory_settings;
create policy "month_end_inventory_settings: managers read" on public.month_end_inventory_settings
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "month_end_inventory_rounds: managers read" on public.month_end_inventory_rounds;
create policy "month_end_inventory_rounds: managers read" on public.month_end_inventory_rounds
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "month_end_inventory_requests: managers read" on public.month_end_inventory_requests;
create policy "month_end_inventory_requests: managers read" on public.month_end_inventory_requests
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "month_end_inventory_files: managers read" on public.month_end_inventory_files;
create policy "month_end_inventory_files: managers read" on public.month_end_inventory_files
  for select to authenticated using (public.get_my_role() = 'manager');

revoke all on public.month_end_inventory_settings from anon, public, authenticated;
revoke all on public.month_end_inventory_rounds from anon, public, authenticated;
revoke all on public.month_end_inventory_requests from anon, public, authenticated;
revoke all on public.month_end_inventory_files from anon, public, authenticated;
grant select on public.month_end_inventory_settings to authenticated;
grant select on public.month_end_inventory_rounds to authenticated;
grant select on public.month_end_inventory_requests to authenticated;
grant select on public.month_end_inventory_files to authenticated;

-- ── Manager functions ─────────────────────────────────────────────────────────────────────────────────────────────
-- Schedules the day for the chosen employees. Scheduling the same day again adds the missing people.
create or replace function public.schedule_month_end_inventory(p_due_date date, p_user_ids uuid[])
returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  today date := (now() at time zone 'America/Toronto')::date;
  v_round_id uuid;
  picked uuid;
  names text[] := '{}';
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'month_end_inventory_not_allowed' using errcode = '42501';
  end if;
  if p_due_date is null or p_due_date < today or p_due_date > today + 366 then
    raise exception 'month_end_inventory_bad_date' using errcode = '22023';
  end if;
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) not between 1 and 50 then
    raise exception 'month_end_inventory_bad_people' using errcode = '22023';
  end if;
  insert into public.month_end_inventory_rounds (due_date) values (p_due_date)
  on conflict (due_date) do update set due_date = excluded.due_date
  returning id into v_round_id;
  for picked in select distinct unnest(p_user_ids) loop
    if not exists (select 1 from public.profiles p where p.id = picked and p.role in ('employee', 'foreman', 'subcontractor_1')) then
      raise exception 'month_end_inventory_bad_people' using errcode = '22023';
    end if;
    insert into public.month_end_inventory_requests (round_id, user_id) values (v_round_id, picked)
    on conflict (round_id, user_id) do nothing;
  end loop;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'month_end_inventory_scheduled', null, '', null,
          jsonb_build_object('due_date', p_due_date, 'people', coalesce(array_length(p_user_ids, 1), 0)));
  return v_round_id;
end;
$$;

-- Removes a request that has nothing attached yet (a wrong person or date). A round left empty goes with it.
create or replace function public.remove_month_end_inventory_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  req public.month_end_inventory_requests%rowtype;
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'month_end_inventory_not_allowed' using errcode = '42501';
  end if;
  select * into req from public.month_end_inventory_requests where id = p_request_id for update;
  if not found then return; end if;
  if req.submitted_at is not null or exists (select 1 from public.month_end_inventory_files f where f.request_id = req.id) then
    raise exception 'month_end_inventory_has_files' using errcode = '23514';
  end if;
  delete from public.month_end_inventory_requests where id = req.id;
  delete from public.month_end_inventory_rounds r
    where r.id = req.round_id and not exists (select 1 from public.month_end_inventory_requests q where q.round_id = r.id);
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'month_end_inventory_removed', req.user_id, '', null, '{}'::jsonb);
end;
$$;

-- « Débloquer »: the proof is dispensed with (the employee cannot give it); the sheets can be submitted again.
create or replace function public.waive_month_end_inventory_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  req public.month_end_inventory_requests%rowtype;
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'month_end_inventory_not_allowed' using errcode = '42501';
  end if;
  select * into req from public.month_end_inventory_requests where id = p_request_id for update;
  if not found then raise exception 'month_end_inventory_not_found' using errcode = '22023'; end if;
  if req.submitted_at is not null or req.waived_at is not null then return; end if;
  update public.month_end_inventory_requests
    set waived_at = now(), waived_by = actor_id, waive_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
    where id = req.id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'month_end_inventory_waived', req.user_id, '', null, '{}'::jsonb);
end;
$$;

-- The retention of the pictures (days). Pictures still kept get their new end date from the day they were added.
create or replace function public.set_month_end_inventory_retention(p_days integer)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'month_end_inventory_not_allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days < 7 or p_days > 365 then
    raise exception 'month_end_inventory_bad_retention' using errcode = '22023';
  end if;
  update public.month_end_inventory_settings set retention_days = p_days, updated_at = now() where id;
  update public.month_end_inventory_files set expires_at = uploaded_at + make_interval(days => p_days) where purged_at is null;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'month_end_inventory_retention_set', null, '', null,
          jsonb_build_object('retention_days', p_days));
end;
$$;

-- ── Employee functions ────────────────────────────────────────────────────────────────────────────────────────────
-- What the signed-in employee still owes: the requests whose day has come and that are neither submitted nor waived.
create or replace function public.my_month_end_inventory_due()
returns table (request_id uuid, due_date date, files_count integer)
language sql stable security definer set search_path to 'public' as $$
  select q.id, r.due_date, (select count(*)::integer from public.month_end_inventory_files f where f.request_id = q.id)
  from public.month_end_inventory_requests q
  join public.month_end_inventory_rounds r on r.id = q.round_id
  where q.user_id = auth.uid() and q.submitted_at is null and q.waived_at is null
    and r.due_date <= (now() at time zone 'America/Toronto')::date
  order by r.due_date;
$$;

-- Records one uploaded picture (the object is already in the employee's folder). At most 10 per request.
create or replace function public.add_month_end_inventory_file(p_request_id uuid, p_path text, p_size integer)
returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  req public.month_end_inventory_requests%rowtype;
  days integer;
  file_id uuid;
begin
  if uid is null then raise exception 'month_end_inventory_not_allowed' using errcode = '42501'; end if;
  select * into req from public.month_end_inventory_requests where id = p_request_id and user_id = uid for update;
  if not found then raise exception 'month_end_inventory_not_found' using errcode = '22023'; end if;
  if req.submitted_at is not null or req.waived_at is not null then
    raise exception 'month_end_inventory_closed' using errcode = '23514';
  end if;
  if p_path is null or p_path not like uid::text || '/' || req.id::text || '/%' or char_length(p_path) > 200 then
    raise exception 'month_end_inventory_bad_path' using errcode = '22023';
  end if;
  if p_size is null or p_size < 1 or p_size > 10485760 then
    raise exception 'month_end_inventory_bad_size' using errcode = '22023';
  end if;
  select id into file_id from public.month_end_inventory_files where storage_path = p_path;
  if file_id is not null then return file_id; end if;
  if (select count(*) from public.month_end_inventory_files f where f.request_id = req.id) >= 10 then
    raise exception 'month_end_inventory_too_many' using errcode = '23514';
  end if;
  select retention_days into days from public.month_end_inventory_settings where id;
  insert into public.month_end_inventory_files (request_id, user_id, storage_path, size_bytes, expires_at)
  values (req.id, uid, p_path, p_size, now() + make_interval(days => coalesce(days, 60)))
  returning id into file_id;
  return file_id;
end;
$$;

-- Removes one of the employee's own pictures while the request is still open; returns its path to delete the object.
create or replace function public.remove_own_month_end_inventory_file(p_file_id uuid)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  removed_path text;
begin
  if uid is null then raise exception 'month_end_inventory_not_allowed' using errcode = '42501'; end if;
  delete from public.month_end_inventory_files f
  using public.month_end_inventory_requests q
  where f.id = p_file_id and f.request_id = q.id and q.user_id = uid and q.submitted_at is null and q.waived_at is null
  returning f.storage_path into removed_path;
  return removed_path;
end;
$$;

-- Sends the proof: 5 to 10 pictures. Idempotent once sent.
create or replace function public.submit_month_end_inventory(p_request_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  req public.month_end_inventory_requests%rowtype;
  total integer;
begin
  if uid is null then raise exception 'month_end_inventory_not_allowed' using errcode = '42501'; end if;
  select * into req from public.month_end_inventory_requests where id = p_request_id and user_id = uid for update;
  if not found then raise exception 'month_end_inventory_not_found' using errcode = '22023'; end if;
  if req.submitted_at is not null or req.waived_at is not null then return; end if;
  select count(*) into total from public.month_end_inventory_files f where f.request_id = req.id;
  if total < 5 then raise exception 'month_end_inventory_too_few' using errcode = '23514'; end if;
  update public.month_end_inventory_requests set submitted_at = now() where id = req.id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (uid, public.audit_actor_name(uid), 'month_end_inventory_submitted', uid, '', null,
          jsonb_build_object('files', total));
end;
$$;

-- ── The block: a work sheet cannot be SUBMITTED while a request is open ───────────────────────────────────────────
-- A sheet dated on or after the scheduled day, for an employee who still owes the proof. Drafts are never blocked. The
-- owner's emergency submission (sparklog.owner_submit, 0137) is not blocked either. A separate trigger, so the validated
-- submission contract (validate_job_submission_contract) is left untouched.
create or replace function public.month_end_inventory_gate()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status is distinct from 'submitted' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'submitted' then return new; end if;
  if coalesce(current_setting('sparklog.owner_submit', true), '') = 'on' then return new; end if;
  if exists (
    select 1
    from public.month_end_inventory_requests q
    join public.month_end_inventory_rounds r on r.id = q.round_id
    where q.user_id = new.user_id and q.submitted_at is null and q.waived_at is null
      and r.due_date <= (now() at time zone 'America/Toronto')::date
      and r.due_date <= new.job_date
  ) then
    raise exception using errcode = '23514', message = 'month_end_inventory_required';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_month_end_inventory_gate on public.jobs;
create trigger trg_month_end_inventory_gate before insert or update of status on public.jobs
  for each row execute function public.month_end_inventory_gate();

-- ── Grants ────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.schedule_month_end_inventory(date, uuid[]) from public, anon;
grant execute on function public.schedule_month_end_inventory(date, uuid[]) to authenticated;
revoke all on function public.remove_month_end_inventory_request(uuid) from public, anon;
grant execute on function public.remove_month_end_inventory_request(uuid) to authenticated;
revoke all on function public.waive_month_end_inventory_request(uuid, text) from public, anon;
grant execute on function public.waive_month_end_inventory_request(uuid, text) to authenticated;
revoke all on function public.set_month_end_inventory_retention(integer) from public, anon;
grant execute on function public.set_month_end_inventory_retention(integer) to authenticated;
revoke all on function public.my_month_end_inventory_due() from public, anon;
grant execute on function public.my_month_end_inventory_due() to authenticated;
revoke all on function public.add_month_end_inventory_file(uuid, text, integer) from public, anon;
grant execute on function public.add_month_end_inventory_file(uuid, text, integer) to authenticated;
revoke all on function public.remove_own_month_end_inventory_file(uuid) from public, anon;
grant execute on function public.remove_own_month_end_inventory_file(uuid) to authenticated;
revoke all on function public.submit_month_end_inventory(uuid) from public, anon;
grant execute on function public.submit_month_end_inventory(uuid) to authenticated;
revoke all on function public.month_end_inventory_gate() from public, anon, authenticated;
