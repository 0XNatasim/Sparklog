-- 0132: « Surveillance » — one read-only RPC that turns the silent failures into a visible list (V2.4.227).
--
-- Nothing here changes data. The manager screen (Gestion › Santé du système) shows each check as
-- ok / warn / bad so a scheduled job that stopped, an export that never left, or a retention that no
-- longer purges is noticed on the day instead of weeks later. Only a manager-level session (aal2, see
-- get_my_role) gets rows; everyone else gets an empty list. No path, name or amount is returned.
--
-- Checks (status ok | warn | bad, `value` = the count or the age in hours that was measured):
--   cron_failed        a pg_cron job whose latest run failed
--   cron_stale         a pg_cron job that has not run for more than 36 h (daily jobs)
--   evidence_overdue   overtime proofs / parking photos kept 2 days past their retention date
--   export_stuck       jobs 'approved' but never exported to the Google Sheet for over 1 hour
--   rates_stale        CCQ rate snapshot older than 3 days (the daily sync stopped)

create or replace function public.system_health_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_n bigint;
  v_h numeric;
begin
  if public.get_my_role() is distinct from 'manager' then
    return v_out;
  end if;

  -- Scheduled jobs: latest run per job.
  begin
    select count(*) into v_n
    from cron.job j
    join lateral (select status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) last on true
    where j.active and last.status = 'failed';
    v_out := v_out || jsonb_build_object('id', 'cron_failed', 'status', case when v_n = 0 then 'ok' else 'bad' end, 'value', v_n);

    select count(*) into v_n
    from cron.job j
    where j.active
      and coalesce((select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid), '-infinity'::timestamptz)
          < now() - interval '36 hours';
    v_out := v_out || jsonb_build_object('id', 'cron_stale', 'status', case when v_n = 0 then 'ok' else 'bad' end, 'value', v_n);
  exception when others then
    v_out := v_out || jsonb_build_object('id', 'cron_failed', 'status', 'warn', 'value', null);
  end;

  -- Retention not applied: files kept 2+ days after their expiry.
  select
    (select count(*) from public.overtime_evidence where expires_at < now() - interval '2 days')
    + (select count(*) from public.parking_receipts where expires_at < now() - interval '2 days' and storage_path is not null and pictures_purged_at is null)
  into v_n;
  v_out := v_out || jsonb_build_object('id', 'evidence_overdue', 'status', case when v_n = 0 then 'ok' else 'bad' end, 'value', v_n);

  -- Approved but never exported (an export that failed halfway or was lost).
  select count(*) into v_n from public.jobs
  where status = 'approved' and exported_to_sheet = false and updated_at < now() - interval '1 hour';
  v_out := v_out || jsonb_build_object('id', 'export_stuck', 'status', case when v_n = 0 then 'ok' else 'bad' end, 'value', v_n);

  -- CCQ rates: age of the latest snapshot, in hours.
  select extract(epoch from (now() - max(fetched_at))) / 3600 into v_h from public.ccq_rate_snapshots;
  v_out := v_out || jsonb_build_object(
    'id', 'rates_stale',
    'status', case when v_h is null then 'warn' when v_h > 72 then 'bad' when v_h > 36 then 'warn' else 'ok' end,
    'value', case when v_h is null then null else round(v_h) end
  );

  return v_out;
end;
$$;

revoke all on function public.system_health_checks() from public, anon;
grant execute on function public.system_health_checks() to authenticated;

comment on function public.system_health_checks() is
  'Read-only health list for the manager screen (cron failures, overdue retention, stuck exports, stale CCQ rates). Manager-level (aal2) sessions only.';
