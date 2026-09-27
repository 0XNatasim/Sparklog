-- Applied to production as validate_job_submission_interval (2026-09-21). Superseded by
-- 0062/0063; installs only when the trigger is absent so re-running it never downgrades them.
do $do$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_validate_job_submission' and tgrelid = 'public.jobs'::regclass
  ) then
    return;
  end if;

  create or replace function public.validate_job_submission()
  returns trigger
  language plpgsql
  as $$
  declare
    v_mins integer;
  begin
    if new.status = 'submitted'
       and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      if new.depart is null or new.fin is null then
        raise exception 'invalid_job_interval: depart and fin are required to submit'
          using errcode = 'check_violation';
      end if;
      v_mins := floor((extract(epoch from new.fin) - extract(epoch from new.depart)) / 60);
      if v_mins < 0 then
        v_mins := v_mins + 1440;
      end if;
      if v_mins <= 0 then
        raise exception 'invalid_job_interval: zero or negative duration'
          using errcode = 'check_violation';
      end if;
      if v_mins > 16 * 60 then
        raise exception 'invalid_job_interval: duration exceeds 16h'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end;
  $$;

  create trigger trg_validate_job_submission
    before insert or update on public.jobs
    for each row execute function public.validate_job_submission();
end
$do$;
