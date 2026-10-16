-- 0094: scheduled Edge Functions that actually run (capacity review, 2026-10-16).
--
-- Before: `ccq-daily-sync` posted `Authorization: Bearer YOUR_SERVICE_ROLE_KEY` (a placeholder left in
-- the job) and got 401 every day; `cleanup_overtime_evidence` was not scheduled at all, so the 30-day
-- retention of overtime proofs and inventory screenshots was never applied.
--
-- The service-role key is not stored in the database. Instead a random `cron_secret` lives in Vault
-- (generated here, never in the repository). pg_cron calls each function with:
--   Authorization: Bearer <anon key>   (passes the gateway's verify_jwt; grants nothing by itself)
--   x-cron-secret: <cron_secret>       (checked by the function through verify_cron_secret)
-- Both functions still accept the service-role Bearer token for a manual run.
--
-- Vault entries read by invoke_scheduled_function (set once per project, outside the repository):
--   sparklog_project_url  e.g. https://<ref>.supabase.co
--   sparklog_anon_key     the project's anon (public) JWT
-- A missing entry makes the scheduled call a no-op with a warning instead of a failing request.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Shared secret between pg_cron and the scheduled Edge Functions (x-cron-secret header).'
    );
  end if;
end $$;

-- Called by the Edge Functions with their service-role client. Not callable from the browser.
create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'cron_secret' and decrypted_secret = p_secret
    );
$$;

revoke all on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

-- POSTs to one Edge Function with the anon key + cron secret. Returns the pg_net request id
-- (response in net._http_response), or null when the Vault entries are missing.
create or replace function public.invoke_scheduled_function(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_anon text;
  v_secret text;
begin
  if p_function !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid function name %', p_function;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sparklog_project_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'sparklog_anon_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_anon is null or v_secret is null then
    raise warning 'invoke_scheduled_function(%): vault entries sparklog_project_url / sparklog_anon_key / cron_secret missing', p_function;
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-cron-secret', v_secret
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_scheduled_function(text, jsonb) from public, anon, authenticated;

-- Replace the broken job and add the cleanup (03:17 Montréal in winter, 04:17 in summer).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ccq-daily-sync') then
    perform cron.unschedule('ccq-daily-sync');
  end if;
  if exists (select 1 from cron.job where jobname = 'cleanup-evidence-daily') then
    perform cron.unschedule('cleanup-evidence-daily');
  end if;
end $$;

select cron.schedule('ccq-daily-sync', '0 9 * * *',
  $$select public.invoke_scheduled_function('ccq_rates_daily_sync')$$);
select cron.schedule('cleanup-evidence-daily', '17 8 * * *',
  $$select public.invoke_scheduled_function('cleanup_overtime_evidence')$$);
