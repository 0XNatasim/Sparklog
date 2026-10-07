-- 0072: the end-of-shift inventory screenshots become opt-in per employee.
-- A manager ticks the option in the Employees panel; only ticked employees are asked for
-- (and, at submission, required to have) the three inventory screenshots. Default is off.
-- Employees cannot change it themselves: profiles_enforce_employee_whitelist (0018) only
-- lets them update an explicit list of fields, which does not include this column.

alter table public.profiles
  add column if not exists inventory_screenshots_enabled boolean not null default false;

-- Submission gate (replaces the 0071 body; the only change is the per-employee option).
create or replace function public.validate_job_submission_contract()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  duration_minutes integer;
  other_minutes integer;
  day_has_evidence boolean;
  is_office_employee boolean;
  inventory_enabled boolean;
begin
  if new.status <> 'submitted' then return new; end if;
  if tg_op = 'UPDATE' and old.status not in ('saved', 'updated') then return new; end if;
  if new.started_at is null or new.ended_at is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := extract(epoch from (new.ended_at - new.started_at))::integer / 60;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select coalesce(p.role = 'admin', false), coalesce(p.inventory_screenshots_enabled, false)
  into is_office_employee, inventory_enabled
  from public.profiles p where p.id = new.user_id;
  select
    coalesce(sum(case
      when j.started_at is not null and j.ended_at is not null
        then extract(epoch from (j.ended_at - j.started_at))::integer / 60
      when j.depart is not null and j.fin is not null
        then (extract(epoch from (j.fin - j.depart))::integer / 60 + 1440) % 1440
      else 0
    end), 0)::integer,
    coalesce(bool_or(j.overtime_evidence_captured), false)
  into other_minutes, day_has_evidence
  from public.jobs j
  where j.user_id = new.user_id
    and j.job_date = new.job_date
    and j.id <> new.id
    and j.status in ('saved', 'updated', 'submitted', 'approved');

  if not coalesce(is_office_employee, false)
     and duration_minutes + other_minutes > 480
     and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- End-of-shift inventory: the day must carry all three Field Service inventory
  -- screenshots (office staff are exempt, and days before the rollout date are grandfathered).
  if not coalesce(is_office_employee, false)
     and coalesce(inventory_enabled, false)
     and new.job_date >= date '2026-10-08'
     and (select count(distinct s.slot) from public.inventory_screenshots s
          where s.user_id = new.user_id and s.job_date = new.job_date) < 3 then
    raise exception using errcode = '23514', message = 'inventory_screenshots_required';
  end if;

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
