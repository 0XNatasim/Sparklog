-- Phase 3: CCQ card renewal reminders.
--
-- A daily job posts a manager notification 60 days and again 30 days before a
-- CCQ card's expiration. Per-expiration markers on the profile prevent repeats;
-- uploading a new card (which nulls the markers) re-arms both reminders.

-- Renewal notifications are not tied to a job.
alter table public.manager_notifications alter column job_id drop not null;

create or replace function public.notify_ccq_renewals()
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
  global_enabled boolean;
begin
  select ccq_card_enabled into global_enabled from public.company_capture_settings where id = true;

  for r in
    select p.id,
           p.ccq_expiration_date,
           (p.ccq_expiration_date - current_date) as days_left,
           coalesce(p.ccq_card_capture_enabled, global_enabled, false) as enabled,
           p.ccq_renewal_60_sent_for,
           p.ccq_renewal_30_sent_for
    from public.profiles p
    where p.ccq_expiration_date is not null
  loop
    if not r.enabled then
      continue;
    end if;

    -- 60-day heads-up (once per expiration).
    if r.days_left <= 60 and r.days_left > 30
       and r.ccq_renewal_60_sent_for is distinct from r.ccq_expiration_date then
      insert into public.manager_notifications (type, employee_id, job_id, daily_minutes, changes)
      values ('ccq_renewal', r.id, null, 0,
              jsonb_build_object('ccq_expiration', r.ccq_expiration_date, 'days_left', r.days_left));
      update public.profiles set ccq_renewal_60_sent_for = r.ccq_expiration_date where id = r.id;
    end if;

    -- 30-day final reminder (once per expiration).
    if r.days_left <= 30
       and r.ccq_renewal_30_sent_for is distinct from r.ccq_expiration_date then
      insert into public.manager_notifications (type, employee_id, job_id, daily_minutes, changes)
      values ('ccq_renewal', r.id, null, 0,
              jsonb_build_object('ccq_expiration', r.ccq_expiration_date, 'days_left', r.days_left));
      update public.profiles set ccq_renewal_30_sent_for = r.ccq_expiration_date where id = r.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.notify_ccq_renewals() from public, anon, authenticated;

-- Run daily at 12:00 UTC (~07:00-08:00 America/Toronto).
select cron.unschedule('ccq-card-renewals')
where exists (select 1 from cron.job where jobname = 'ccq-card-renewals');
select cron.schedule('ccq-card-renewals', '0 12 * * *', $$ select public.notify_ccq_renewals(); $$);
