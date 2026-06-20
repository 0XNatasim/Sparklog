-- Schedule a daily CCQ rate sync via pg_cron + pg_net.
-- Runs at 09:00 UTC every day (≈ 05:00 EDT / 04:00 EST — before the workday).
--
-- BEFORE running this migration you must set the service-role key once:
--   alter role postgres set "app.service_role_key" = '<your-service-role-key>';
-- or run it in the Supabase SQL editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove existing schedule if any (idempotent)
select cron.unschedule('ccq-daily-sync') where exists (
  select 1 from cron.job where jobname = 'ccq-daily-sync'
);

select cron.schedule(
  'ccq-daily-sync',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://sqpsjmyycxxwfstmpgom.supabase.co/functions/v1/ccq_rates_daily_sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
