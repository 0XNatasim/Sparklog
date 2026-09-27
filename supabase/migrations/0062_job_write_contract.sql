-- Authoritative database half of the UI/DB job contract. Keep the numeric values
-- aligned with src/lib/job-contract.js; the Vitest contract suite verifies both.

alter table public.jobs drop constraint if exists jobs_return_time_minutes_check;
alter table public.jobs add constraint jobs_return_time_minutes_check
  check (return_time_minutes >= 0 and return_time_minutes <= 240 and (return_time_minutes % 5) = 0);

create or replace function public.validate_job_submission_contract()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  start_minutes integer;
  end_minutes integer;
  duration_minutes integer;
begin
  if new.status <> 'submitted' then return new; end if;

  if new.depart is null or new.fin is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;

  start_minutes := extract(hour from new.depart)::integer * 60
                   + extract(minute from new.depart)::integer;
  end_minutes := extract(hour from new.fin)::integer * 60
                 + extract(minute from new.fin)::integer;
  duration_minutes := end_minutes - start_minutes;
  if duration_minutes <= 0 then duration_minutes := duration_minutes + 1440; end if;

  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
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

drop trigger if exists trg_validate_job_submission on public.jobs;
create trigger trg_validate_job_submission
  before insert or update on public.jobs
  for each row execute function public.validate_job_submission_contract();

-- Old validator from validate_job_submission_interval; the trigger above no longer uses it.
drop function if exists public.validate_job_submission();

revoke all on function public.validate_job_submission_contract() from public, anon, authenticated;
