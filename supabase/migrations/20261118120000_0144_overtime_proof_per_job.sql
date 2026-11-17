-- 0144: an overtime proof stays on the work order it was added for (V2.4.271, Phase 10).
--
-- Owner decision 2026-11-17: every work order that goes past the 8 h line (10 h with « 4 jours de 10 h ») carries its own
-- screenshot of the overtime request form, and each screenshot follows the job it was submitted on (3 such jobs = 3 proofs).
--
-- 1. The trigger function of 0068 no longer MOVES the day's proofs (and their manager notifications) onto the day's last job;
--    it only keeps the capture flag of each job in step with its own proofs (flag = the job holds a proof). The function
--    keeps its name so the five triggers that call it stay as they are. Like before, a day without any proof is left alone
--    (a flag whose proof expired is not cleared by an unrelated edit).
-- 2. An employee could not read overtime_evidence (manager-only policy): my_overtime_proofs(date) gives the employee their own
--    proofs of a day (id, job, path), and a storage policy lets them open their own pictures (signed link).
-- 3. save_own_overtime_proof / remove_own_overtime_proof: add, replace or remove the proof of one of their own jobs while the
--    job is still editable (saved / updated, not locked). A submitted job is changed by the managers (they return it).
-- A removed or replaced picture stays in the bucket until the cleanup of orphaned objects (employees get no delete right,
-- so a proof cannot be erased from storage behind the managers' back).

-- 1. Flags follow the proofs of each job; nothing moves.
create or replace function public.attach_overtime_evidence_to_last_job(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user is null or p_date is null then return; end if;
  if not exists (select 1 from public.overtime_evidence e where e.user_id = p_user and e.job_date = p_date) then
    return;
  end if;

  -- Flag-only updates: allowed by the entry-window and manager-field guards, not logged as employee activity, and they do not
  -- re-fire the time-based triggers.
  update public.jobs j
    set overtime_evidence_captured = exists (select 1 from public.overtime_evidence e where e.job_id = j.id)
    where j.user_id = p_user and j.job_date = p_date
      and j.overtime_evidence_captured is distinct from exists (select 1 from public.overtime_evidence e where e.job_id = j.id);
end;
$$;

-- 2. The employee's own proofs of a day, and their own pictures in the bucket.
create or replace function public.my_overtime_proofs(p_date date)
returns table (id uuid, job_id uuid, storage_path text, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select e.id, e.job_id, e.storage_path, e.created_at
  from public.overtime_evidence e
  where e.user_id = auth.uid() and e.job_date = p_date
  order by e.created_at;
$$;

drop policy if exists "overtime storage: owner read" on storage.objects;
create policy "overtime storage: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'overtime-evidence' and (storage.foldername(name))[1] = (auth.uid())::text);

-- 3. Add / replace the proof of one job (p_old_evidence_id null = add).
create or replace function public.save_own_overtime_proof(
  p_job_id uuid, p_old_evidence_id uuid, p_evidence_id uuid, p_storage_path text, p_daily_minutes integer)
returns uuid
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  job public.jobs%rowtype;
  existing public.overtime_evidence%rowtype;
  retention integer;
  minutes integer := least(greatest(coalesce(p_daily_minutes, 0), 0), 1440);
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_job_id is null or p_evidence_id is null or p_storage_path is null then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;
  select * into job from public.jobs j where j.id = p_job_id and j.user_id = uid for update;
  if not found then raise exception using errcode = '22023', message = 'job_not_found'; end if;
  if job.status not in ('saved', 'updated') or coalesce(job.locked, false) then
    raise exception using errcode = '23514', message = 'job_not_editable';
  end if;

  -- Retry after a lost response: this proof is already recorded.
  select * into existing from public.overtime_evidence e where e.id = p_evidence_id;
  if existing.id is not null then
    if existing.user_id <> uid then raise exception using errcode = '42501', message = 'evidence_not_owned'; end if;
    return existing.id;
  end if;

  if p_storage_path not like uid::text || '/' || job.job_date::text || '/%' then
    raise exception using errcode = '23514', message = 'invalid_evidence_path';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'overtime-evidence' and o.name = p_storage_path
       and (o.owner_id = uid::text or o.owner = uid)
  ) then
    raise exception using errcode = 'P0002', message = 'evidence_file_missing';
  end if;

  if p_old_evidence_id is not null then
    delete from public.overtime_evidence e where e.id = p_old_evidence_id and e.job_id = p_job_id and e.user_id = uid;
    if not found then raise exception using errcode = '22023', message = 'proof_not_found'; end if;
  end if;

  select coalesce(o.evidence_retention_days, 30) into retention from public.overtime_settings o where o.id = true;
  retention := least(365, greatest(1, coalesce(retention, 30)));
  insert into public.overtime_evidence (id, job_id, user_id, job_date, storage_path, daily_minutes, expires_at, ocr_status)
  values (p_evidence_id, p_job_id, uid, job.job_date, p_storage_path, minutes, now() + make_interval(days => retention), 'pending');

  insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes)
  select 'overtime_evidence', uid, p_job_id, p_evidence_id, minutes
   where not exists (select 1 from public.manager_notifications n where n.evidence_id = p_evidence_id);

  update public.jobs j set overtime_evidence_captured = true where j.id = p_job_id and j.overtime_evidence_captured is not true;
  return p_evidence_id;
end;
$$;

create or replace function public.remove_own_overtime_proof(p_evidence_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  proof public.overtime_evidence%rowtype;
  job public.jobs%rowtype;
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select * into proof from public.overtime_evidence e where e.id = p_evidence_id and e.user_id = uid;
  if not found then return; end if;
  select * into job from public.jobs j where j.id = proof.job_id and j.user_id = uid for update;
  if not found or job.status not in ('saved', 'updated') or coalesce(job.locked, false) then
    raise exception using errcode = '23514', message = 'job_not_editable';
  end if;
  delete from public.overtime_evidence e where e.id = proof.id;
  update public.jobs j
    set overtime_evidence_captured = exists (select 1 from public.overtime_evidence e where e.job_id = j.id)
    where j.id = job.id;
end;
$$;

revoke all on function public.my_overtime_proofs(date) from public, anon;
grant execute on function public.my_overtime_proofs(date) to authenticated;
revoke all on function public.save_own_overtime_proof(uuid, uuid, uuid, text, integer) from public, anon;
grant execute on function public.save_own_overtime_proof(uuid, uuid, uuid, text, integer) to authenticated;
revoke all on function public.remove_own_overtime_proof(uuid) from public, anon;
grant execute on function public.remove_own_overtime_proof(uuid) to authenticated;
