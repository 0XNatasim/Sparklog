-- Make the employee job write a server-owned state transition.
--
-- A client retry may arrive after the first request committed but before its response
-- reached the device.  submission_key identifies that logical operation, while the
-- row lock serializes edits/submissions of an existing draft.  The RPC derives the
-- owner, status and locked flag from auth.uid()/p_submit; callers cannot forge them.

alter table public.jobs
  add column if not exists submission_key uuid;

create unique index if not exists jobs_user_submission_key_uidx
  on public.jobs (user_id, submission_key);

create or replace function public.save_own_job(
  p_job_id uuid,
  p_new_job_id uuid,
  p_submission_key uuid,
  p_submit boolean,
  p_job_date date,
  p_ot text,
  p_depart time,
  p_arrivee time,
  p_fin time,
  p_km_total numeric,
  p_km_aller numeric,
  p_return_time_minutes integer,
  p_km_retour numeric,
  p_overtime_evidence_captured boolean,
  p_parking_receipt_captured boolean
)
returns table (id uuid, status text, locked boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_id uuid := auth.uid();
  current_job public.jobs%rowtype;
  result_job public.jobs%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.is_not_paused() then
    raise exception using errcode = '42501', message = 'job_write_not_allowed';
  end if;
  if p_job_date is null then
    raise exception using errcode = '23514', message = 'job_date_required';
  end if;

  if p_job_id is null then
    if p_submission_key is null then
      raise exception using errcode = '23514', message = 'submission_key_required';
    end if;

    insert into public.jobs (
      id, user_id, submission_key, job_date, ot, depart, arrivee, fin,
      km_total, km_aller, return_time_minutes, km_retour,
      overtime_evidence_captured, parking_receipt_captured, status, locked
    ) values (
      coalesce(p_new_job_id, gen_random_uuid()), caller_id, p_submission_key,
      p_job_date, p_ot, p_depart, p_arrivee, p_fin,
      coalesce(p_km_total, 0), coalesce(p_km_aller, 0),
      coalesce(p_return_time_minutes, 0), coalesce(p_km_retour, 0),
      coalesce(p_overtime_evidence_captured, false),
      coalesce(p_parking_receipt_captured, false),
      case when p_submit then 'submitted' else 'saved' end,
      p_submit
    )
    on conflict (user_id, submission_key) do nothing
    returning * into result_job;

    if result_job.id is null then
      select * into result_job
        from public.jobs j
       where j.user_id = caller_id and j.submission_key = p_submission_key;
    end if;
  else
    select * into current_job
      from public.jobs j
     where j.id = p_job_id and j.user_id = caller_id
     for update;

    if current_job.id is null then
      raise exception using errcode = 'P0002', message = 'job_not_found';
    end if;

    -- A retry after a successful submit is a successful no-op.  No submitted fact
    -- can be changed through this RPC.
    if current_job.status = 'submitted' and current_job.locked and p_submit then
      result_job := current_job;
    else
      if current_job.locked or current_job.status not in ('saved', 'updated') then
        raise exception using errcode = '55000', message = 'job_not_editable';
      end if;

      update public.jobs j
         set job_date = p_job_date,
             ot = p_ot,
             depart = p_depart,
             arrivee = p_arrivee,
             fin = p_fin,
             km_total = coalesce(p_km_total, 0),
             km_aller = coalesce(p_km_aller, 0),
             return_time_minutes = coalesce(p_return_time_minutes, 0),
             km_retour = coalesce(p_km_retour, 0),
             overtime_evidence_captured = coalesce(p_overtime_evidence_captured, false),
             parking_receipt_captured = coalesce(p_parking_receipt_captured, false),
             status = case when p_submit then 'submitted' else 'updated' end,
             locked = p_submit
       where j.id = current_job.id
       returning * into result_job;
    end if;
  end if;

  return query select result_job.id, result_job.status, result_job.locked;
end;
$function$;

revoke all on function public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean)
  from public, anon;
grant execute on function public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean)
  to authenticated;

-- Employees may still create/edit drafts directly for backwards compatibility, but
-- submission is only possible through save_own_job. Manager-tier policies remain
-- independent and continue to support management workflows.
drop policy if exists "jobs: employee insert own" on public.jobs;
create policy "jobs: employee insert own" on public.jobs for insert to authenticated
  with check (
    public.is_not_paused()
    and user_id = auth.uid()
    and status = 'saved'
    and locked = false
  );

drop policy if exists "jobs: employee update own editable" on public.jobs;
create policy "jobs: employee update own editable" on public.jobs for update to authenticated
  using (
    public.is_not_paused()
    and user_id = auth.uid()
    and locked = false
    and status in ('saved', 'updated')
  )
  with check (
    public.is_not_paused()
    and user_id = auth.uid()
    and locked = false
    and status in ('saved', 'updated')
  );

