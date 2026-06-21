-- Schedule a daily CCQ rate sync via pg_cron + pg_net.
-- Runs at 09:00 UTC every day (≈ 05:00 EDT / 04:00 EST).
--
-- Run this SQL directly in the Supabase SQL editor.
-- Replace YOUR_SERVICE_ROLE_KEY with the key from:
--   Supabase Dashboard → Settings → API → service_role (secret)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove existing schedule if any (idempotent)
do $$
begin
  perform cron.unschedule('ccq-daily-sync');
exception when others then null;
end $$;

select cron.schedule(
  'ccq-daily-sync',
  '0 9 * * *',
  $cron$
  select net.http_post(
    url     := 'https://sqpsjmyycxxwfstmpgom.supabase.co/functions/v1/ccq_rates_daily_sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $cron$
);
