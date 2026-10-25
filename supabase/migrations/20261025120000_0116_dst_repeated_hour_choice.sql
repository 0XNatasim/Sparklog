-- 0116: changement d'heure de l'automne — la « 1 h du matin » qui se répète (V2.4.177).
--
-- The night of the fall time change (America/Toronto, first Sunday of November) the hour from 1:00 to 2:00
-- happens twice. 0063 refuses any job whose départ or fin falls in it, because the real instant cannot be
-- guessed. A manager can now say which time it was: depart_fold / fin_fold = 1 (first time, before the
-- clocks go back, EDT) or 2 (second time, after, EST). Without a choice the time is still refused.
-- Only the owner-level emergency timesheet (create_job_for_employee, security definer) writes the choice:
-- a direct write from the browser (employees included) is refused (dst_choice_manager_only). When the time
-- is not in the repeated hour, the choice is cleared. Pay keeps counting clock time (minutesBetween):
-- this only fixes started_at / ended_at (overlap, duration checks, timesheet order).

alter table public.jobs
  add column if not exists depart_fold smallint,
  add column if not exists fin_fold smallint;

alter table public.jobs drop constraint if exists jobs_dst_fold_chk;
alter table public.jobs add constraint jobs_dst_fold_chk
  check ((depart_fold is null or depart_fold in (1, 2)) and (fin_fold is null or fin_fold in (1, 2)));

-- One Montréal civil time → its instant. Montréal is UTC-4 (EDT) or UTC-5 (EST): testing both gives 0
-- candidates in the spring gap, 2 in the repeated fall hour, 1 otherwise. In the repeated hour the choice
-- picks the first (1, earlier instant) or second (2) time; without a choice it is refused.
create or replace function public.montreal_local_instant(p_local timestamp, p_fold smallint, out instant timestamptz, out repeated boolean)
language plpgsql stable set search_path to 'public' as $function$
declare
  tz text := 'America/Toronto';
  first_time timestamptz := (p_local + interval '4 hours') at time zone 'UTC';
  second_time timestamptz := (p_local + interval '5 hours') at time zone 'UTC';
  first_ok boolean := timezone(tz, first_time) = p_local;
  second_ok boolean := timezone(tz, second_time) = p_local;
begin
  repeated := first_ok and second_ok;
  if not first_ok and not second_ok then
    raise exception using errcode = '22007', message = 'nonexistent_montreal_local_time';
  end if;
  if repeated then
    if p_fold is null then
      raise exception using errcode = '22007', message = 'ambiguous_montreal_local_time';
    end if;
    instant := case when p_fold = 1 then first_time else second_time end;
  else
    instant := case when first_ok then first_time else second_time end;
  end if;
end;
$function$;

create or replace function public.resolve_montreal_job_instants()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  start_local timestamp;
  end_local timestamp;
  start_result record;
  end_result record;
begin
  -- The choice of the repeated hour is a manager decision (emergency timesheet RPC, security definer).
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and (new.depart_fold is not null or new.fin_fold is not null))
    or (tg_op = 'UPDATE' and (new.depart_fold is distinct from old.depart_fold or new.fin_fold is distinct from old.fin_fold))
  ) then
    raise exception using errcode = '42501', message = 'dst_choice_manager_only';
  end if;

  if new.depart is null or new.fin is null then
    new.started_at := null;
    new.ended_at := null;
    return new;
  end if;

  start_local := new.job_date + new.depart;
  end_local := new.job_date + new.fin;
  if new.fin <= new.depart then end_local := end_local + interval '1 day'; end if;

  select * into start_result from public.montreal_local_instant(start_local, new.depart_fold);
  select * into end_result from public.montreal_local_instant(end_local, new.fin_fold);
  -- A choice only means something in the repeated hour.
  if not start_result.repeated then new.depart_fold := null; end if;
  if not end_result.repeated then new.fin_fold := null; end if;

  new.started_at := start_result.instant;
  new.ended_at := end_result.instant;
  return new;
end;
$function$;

drop trigger if exists trg_00_resolve_montreal_job_instants on public.jobs;
create trigger trg_00_resolve_montreal_job_instants
  before insert or update of job_date, depart, fin, depart_fold, fin_fold on public.jobs
  for each row execute function public.resolve_montreal_job_instants();

-- Emergency timesheet (0075): same function, plus the choice of the repeated hour for départ and fin.
drop function if exists public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text);

create or replace function public.create_job_for_employee(
  p_employee_id uuid,
  p_submission_key uuid,
  p_job_date date,
  p_ot text,
  p_depart time,
  p_arrivee time,
  p_fin time,
  p_km_aller numeric,
  p_note text,
  p_depart_fold smallint default null,
  p_fin_fold smallint default null
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
  if (p_depart_fold is not null and p_depart_fold not in (1, 2))
     or (p_fin_fold is not null and p_fin_fold not in (1, 2)) then
    raise exception using errcode = '23514', message = 'invalid_dst_choice';
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
    user_id, submission_key, job_date, ot, depart, arrivee, fin, depart_fold, fin_fold,
    km_total, km_aller, return_time_minutes, km_retour,
    status, locked,
    manager_entry_at, manager_entry_by, manager_entry_by_name, manager_entry_note
  ) values (
    p_employee_id, p_submission_key, p_job_date, clean_ot, p_depart, p_arrivee, p_fin, p_depart_fold, p_fin_fold,
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
                             'note', clean_note, 'depart_fold', new_job.depart_fold, 'fin_fold', new_job.fin_fold));

  return query select new_job.id, new_broadcast;
end;
$function$;


revoke all on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint)
  from public, anon;
grant execute on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint)
  to authenticated;
revoke all on function public.montreal_local_instant(timestamp, smallint) from public, anon;
grant execute on function public.montreal_local_instant(timestamp, smallint) to authenticated;
