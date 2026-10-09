-- 0075: Owner emergency timesheet.
--
-- In an emergency an OWNER (profiles.role = 'owner', checked with is_privileged()) can
-- create a draft job for an employee. The owner can never submit it: the employee finds
-- it in History flagged "to validate", reviews it, and submits it with an explicit
-- confirmation. Only then does it enter the normal approval/export circuit.
--
-- Everything security-relevant is server-owned:
--   * create_job_for_employee: owner-only, idempotent (per-employee submission key),
--     window = today and the previous 31 days (America/Toronto), always status 'saved'.
--   * save_own_job: refuses to submit a manager-created job until the employee confirms
--     (p_confirm_manager_entry => employee_confirmed_at is stamped atomically).
--   * the manager-entry columns cannot be written through the API by an employee/anon.

alter table public.jobs
  add column if not exists manager_entry_at timestamptz,
  add column if not exists manager_entry_by uuid,
  add column if not exists manager_entry_by_name text,
  add column if not exists manager_entry_note text,
  add column if not exists manager_entry_reminded_at timestamptz,
  add column if not exists employee_confirmed_at timestamptz;

create index if not exists jobs_manager_entry_idx
  on public.jobs (manager_entry_at desc)
  where manager_entry_at is not null;

-- Not SECURITY DEFINER on purpose: current_user is the role executing the statement, so
-- a direct API write ('authenticated'/'anon') is refused while the definer RPCs below
-- (owner role) and the service role pass.
create or replace function public.protect_job_manager_entry_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.manager_entry_at is not null
         or new.manager_entry_by is not null
         or new.manager_entry_by_name is not null
         or new.manager_entry_note is not null
         or new.manager_entry_reminded_at is not null
         or new.employee_confirmed_at is not null then
        raise exception using errcode = '42501', message = 'manager_entry_fields_protected';
      end if;
    elsif new.manager_entry_at is distinct from old.manager_entry_at
       or new.manager_entry_by is distinct from old.manager_entry_by
       or new.manager_entry_by_name is distinct from old.manager_entry_by_name
       or new.manager_entry_note is distinct from old.manager_entry_note
       or new.manager_entry_reminded_at is distinct from old.manager_entry_reminded_at
       or new.employee_confirmed_at is distinct from old.employee_confirmed_at then
      raise exception using errcode = '42501', message = 'manager_entry_fields_protected';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists jobs_protect_manager_entry_fields on public.jobs;
create trigger jobs_protect_manager_entry_fields
  before insert or update on public.jobs
  for each row execute function public.protect_job_manager_entry_fields();

revoke all on function public.protect_job_manager_entry_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner creates a draft job for an employee.
-- ---------------------------------------------------------------------------
create or replace function public.create_job_for_employee(
  p_employee_id uuid,
  p_submission_key uuid,
  p_job_date date,
  p_ot text,
  p_depart time,
  p_arrivee time,
  p_fin time,
  p_km_aller numeric,
  p_note text
)
returns table (id uuid, broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  target public.profiles%rowtype;
  existing public.jobs%rowtype;
  new_job public.jobs%rowtype;
  new_broadcast uuid;
  today_local date := (timezone('America/Toronto', now()))::date;
  clean_ot text := btrim(coalesce(p_ot, ''));
  clean_note text := btrim(coalesce(p_note, ''));
  duration_minutes integer;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if p_employee_id is null or p_submission_key is null or p_job_date is null then
    raise exception using errcode = '23514', message = 'manager_entry_missing_field';
  end if;
  if clean_ot = '' then
    raise exception using errcode = '23514', message = 'manager_entry_ot_required';
  end if;
  if char_length(clean_note) < 3 or char_length(clean_note) > 500 then
    raise exception using errcode = '23514', message = 'manager_entry_note_required';
  end if;
  if p_job_date > today_local or p_job_date < today_local - 31 then
    raise exception using errcode = '23514', message = 'manager_entry_date_out_of_window';
  end if;
  if p_depart is null or p_fin is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := (extract(epoch from (p_fin - p_depart))::integer / 60);
  if duration_minutes <= 0 then duration_minutes := duration_minutes + 1440; end if;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  if p_km_aller is not null and p_km_aller < 0 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;

  select * into target from public.profiles p where p.id = p_employee_id;
  if target.id is null
     or target.role not in ('employee', 'admin', 'subcontractor_1')
     or target.is_paused then
    raise exception using errcode = 'P0002', message = 'manager_entry_employee_not_eligible';
  end if;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));

  -- A retry (lost response, double click) resolves to the committed row: one job, one
  -- audit event, one notification.
  select * into existing from public.jobs j
   where j.user_id = p_employee_id and j.submission_key = p_submission_key;
  if existing.id is not null then
    if existing.manager_entry_at is null then
      raise exception using errcode = '23505', message = 'submission_key_conflict';
    end if;
    return query select existing.id, null::uuid;
    return;
  end if;

  actor_name := public.audit_actor_name(actor_id);

  insert into public.jobs (
    user_id, submission_key, job_date, ot, depart, arrivee, fin,
    km_total, km_aller, return_time_minutes, km_retour,
    status, locked,
    manager_entry_at, manager_entry_by, manager_entry_by_name, manager_entry_note
  ) values (
    p_employee_id, p_submission_key, p_job_date, clean_ot, p_depart, p_arrivee, p_fin,
    coalesce(p_km_aller, 0), coalesce(p_km_aller, 0), 0, 0,
    'saved', false,
    now(), actor_id, actor_name, clean_note
  )
  returning * into new_job;

  -- The employee must be able to submit a past-dated job even after the daily entry
  -- deadline (enforce_job_entry_window): open that day for 14 days. A null (no expiry)
  -- unlock is never shortened.
  insert into public.job_entry_unlocks (user_id, job_date, unlocked_until, reason, created_by)
  values (p_employee_id, p_job_date, now() + interval '14 days', 'manager_entry', actor_id)
  on conflict (user_id, job_date) do update
    set unlocked_until = case
      when public.job_entry_unlocks.unlocked_until is null then null
      else greatest(public.job_entry_unlocks.unlocked_until, excluded.unlocked_until)
    end;

  insert into public.manager_broadcasts (sender_id, body, audience)
  values (
    actor_id,
    'Une feuille de temps a été créée pour vous (' || to_char(p_job_date, 'YYYY-MM-DD')
      || '). Ouvrez Historique, vérifiez-la puis validez-la pour la soumettre.'
      || E'\n\n'
      || 'A timesheet was created for you (' || to_char(p_job_date, 'YYYY-MM-DD')
      || '). Open History, review it, then confirm it to submit.',
    'selected'
  )
  returning manager_broadcasts.id into new_broadcast;
  insert into public.broadcast_recipients (broadcast_id, employee_id)
  values (new_broadcast, p_employee_id);

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_created_by_owner', p_employee_id, target.full_name, new_job.id,
          jsonb_build_object('job_date', p_job_date, 'ot', clean_ot, 'depart', p_depart,
                             'arrivee', p_arrivee, 'fin', p_fin, 'km', coalesce(p_km_aller, 0),
                             'note', clean_note));

  return query select new_job.id, new_broadcast;
end;
$function$;

revoke all on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text)
  from public, anon;
grant execute on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Owner reminds an employee about a job still waiting for validation (max 1 / hour).
-- ---------------------------------------------------------------------------
create or replace function public.remind_manager_entry(p_job_id uuid)
returns table (broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  current_job public.jobs%rowtype;
  new_broadcast uuid;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;

  select * into current_job from public.jobs j where j.id = p_job_id for update;
  if current_job.id is null or current_job.manager_entry_at is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if current_job.employee_confirmed_at is not null
     or current_job.locked
     or current_job.status not in ('saved', 'updated') then
    raise exception using errcode = '40001', message = 'job_state_changed';
  end if;
  if current_job.manager_entry_reminded_at is not null
     and current_job.manager_entry_reminded_at > now() - interval '1 hour' then
    raise exception using errcode = '55000', message = 'reminder_too_soon';
  end if;

  actor_name := public.audit_actor_name(actor_id);

  update public.jobs j set manager_entry_reminded_at = now() where j.id = current_job.id;

  insert into public.job_entry_unlocks (user_id, job_date, unlocked_until, reason, created_by)
  values (current_job.user_id, current_job.job_date, now() + interval '14 days', 'manager_entry', actor_id)
  on conflict (user_id, job_date) do update
    set unlocked_until = case
      when public.job_entry_unlocks.unlocked_until is null then null
      else greatest(public.job_entry_unlocks.unlocked_until, excluded.unlocked_until)
    end;

  insert into public.manager_broadcasts (sender_id, body, audience)
  values (
    actor_id,
    'Rappel : une feuille de temps du ' || to_char(current_job.job_date, 'YYYY-MM-DD')
      || ' attend votre validation dans Historique.'
      || E'\n\n'
      || 'Reminder: a timesheet for ' || to_char(current_job.job_date, 'YYYY-MM-DD')
      || ' is waiting for your confirmation in History.',
    'selected'
  )
  returning manager_broadcasts.id into new_broadcast;
  insert into public.broadcast_recipients (broadcast_id, employee_id)
  values (new_broadcast, current_job.user_id);

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'manager_entry_reminded', current_job.user_id,
          public.audit_actor_name(current_job.user_id), current_job.id,
          jsonb_build_object('job_date', current_job.job_date));

  return query select new_broadcast;
end;
$function$;

revoke all on function public.remind_manager_entry(uuid) from public, anon;
grant execute on function public.remind_manager_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_own_job: a manager-created job needs the employee's explicit confirmation to be
-- submitted. The new parameter has a default, so the previous overload is dropped to
-- avoid an ambiguous call; existing clients (which omit it) keep working unchanged.
-- ---------------------------------------------------------------------------
drop function if exists public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean);

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
  p_parking_receipt_captured boolean,
  p_confirm_manager_entry boolean default false
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
  confirming boolean := false;
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

    -- Look up the key first: BEFORE INSERT triggers run before ON CONFLICT and would flag the retry as an overlap.
    perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));
    select * into result_job
      from public.jobs j
     where j.user_id = caller_id and j.submission_key = p_submission_key;

    if result_job.id is null then
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

      -- A job created by an owner must be explicitly confirmed by the employee first.
      if p_submit and current_job.manager_entry_at is not null
         and current_job.employee_confirmed_at is null then
        if not coalesce(p_confirm_manager_entry, false) then
          raise exception using errcode = '55000', message = 'manager_entry_confirmation_required';
        end if;
        confirming := true;
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
             locked = p_submit,
             employee_confirmed_at = case when confirming then now() else j.employee_confirmed_at end
       where j.id = current_job.id
       returning * into result_job;

      if confirming then
        insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
        values (caller_id, public.audit_actor_name(caller_id), 'manager_entry_confirmed', caller_id,
                public.audit_actor_name(caller_id), result_job.id,
                jsonb_build_object('job_date', result_job.job_date, 'ot', result_job.ot,
                                   'created_by', current_job.manager_entry_by_name));
      end if;
    end if;
  end if;

  return query select result_job.id, result_job.status, result_job.locked;
end;
$function$;

revoke all on function public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean, boolean)
  to authenticated;
