-- Montréal uses the America/Toronto IANA rules (EST/EDT). Persist resolved instants
-- alongside the approved wall-clock fields and reject DST gaps/folds rather than
-- silently selecting one of two possible hours.

alter table public.jobs
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

create or replace function public.resolve_montreal_job_instants()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  tz text := 'America/Toronto';
  start_local timestamp;
  end_local timestamp;
  start_candidate timestamptz;
  end_candidate timestamptz;
begin
  if new.depart is null or new.fin is null then
    new.started_at := null;
    new.ended_at := null;
    return new;
  end if;

  start_local := new.job_date + new.depart;
  end_local := new.job_date + new.fin;
  if new.fin <= new.depart then end_local := end_local + interval '1 day'; end if;
  start_candidate := start_local at time zone tz;
  end_candidate := end_local at time zone tz;

  if timezone(tz, start_candidate) <> start_local
     or timezone(tz, end_candidate) <> end_local then
    raise exception using errcode = '22007', message = 'nonexistent_montreal_local_time';
  end if;
  if timezone(tz, start_candidate - interval '1 hour') = start_local
     or timezone(tz, start_candidate + interval '1 hour') = start_local
     or timezone(tz, end_candidate - interval '1 hour') = end_local
     or timezone(tz, end_candidate + interval '1 hour') = end_local then
    raise exception using errcode = '22007', message = 'ambiguous_montreal_local_time';
  end if;

  new.started_at := start_candidate;
  new.ended_at := end_candidate;
  return new;
end;
$function$;

drop trigger if exists trg_resolve_montreal_job_instants on public.jobs;
drop trigger if exists trg_00_resolve_montreal_job_instants on public.jobs;
create trigger trg_00_resolve_montreal_job_instants
  before insert or update of job_date, depart, fin on public.jobs
  for each row execute function public.resolve_montreal_job_instants();

-- Backfill rows created before instant persistence was introduced. PostgreSQL's
-- timezone conversion deterministically chooses the standard-time occurrence for
-- a historical fold; new/edited rows still require an unambiguous civil time.
update public.jobs
set started_at = (job_date + depart) at time zone 'America/Toronto',
    ended_at = (
      job_date + fin
      + case when fin <= depart then interval '1 day' else interval '0' end
    ) at time zone 'America/Toronto'
where depart is not null
  and fin is not null
  and (started_at is null or ended_at is null);

-- Use actual elapsed instants, not wall-clock subtraction, for submitted jobs.
create or replace function public.validate_job_submission_contract()
returns trigger language plpgsql set search_path to 'public' as $function$
declare duration_minutes integer;
begin
  if new.status <> 'submitted' then return new; end if;
  if new.started_at is null or new.ended_at is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := extract(epoch from (new.ended_at - new.started_at))::integer / 60;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  -- Serialize submissions per employee so two concurrent overlapping inserts cannot
  -- both pass the check before either becomes visible.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (
    select 1 from public.jobs j
    where j.user_id = new.user_id
      and j.id <> new.id
      and j.status in ('submitted', 'approved')
      and j.started_at is not null and j.ended_at is not null
      and tstzrange(j.started_at, j.ended_at, '[)')
          && tstzrange(new.started_at, new.ended_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'overlapping_job_interval';
  end if;
  if new.return_time_minutes > duration_minutes then
    raise exception using errcode = '23514', message = 'return_time_exceeds_job_interval';
  end if;
  if new.km_total is null or new.km_aller is null or new.km_retour is null
     or new.km_total < 0 or new.km_aller < 0 or new.km_retour < 0
     or new.km_retour > new.km_total
     or abs((new.km_aller + new.km_retour) - new.km_total) > 0.001 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;
  return new;
end;
$function$;

-- Entry deadlines use the configured IANA timezone rather than a duplicated literal.
create or replace function public.enforce_job_entry_window()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  local_now timestamp;
  deadline time;
  company_tz text;
  has_unlock boolean;
  unchanged public.jobs;
begin
  if public.get_my_role() = 'manager' or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then
    unchanged := new;
    unchanged.parking_receipt_captured := old.parking_receipt_captured;
    unchanged.meal_claim_captured := old.meal_claim_captured;
    unchanged.overtime_evidence_captured := old.overtime_evidence_captured;
    if unchanged is not distinct from old then return new; end if;
  end if;
  select timezone, daily_deadline into company_tz, deadline
    from public.company_time_settings where id = true;
  company_tz := coalesce(company_tz, 'America/Toronto');
  deadline := coalesce(deadline, '23:59'::time);
  local_now := timezone(company_tz, now());
  select exists (
    select 1 from public.job_entry_unlocks
    where user_id = new.user_id and job_date = new.job_date
      and (unlocked_until is null or unlocked_until > now())
  ) into has_unlock;
  if has_unlock then return new; end if;
  if exists (select 1 from public.company_holidays where holiday_date = new.job_date) then
    raise exception 'Jobs cannot be entered for a company holiday';
  end if;
  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;
  return new;
end;
$function$;

revoke all on function public.resolve_montreal_job_instants() from public, anon, authenticated;
