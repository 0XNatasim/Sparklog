-- Live infrastructure stats for the audit screen (managers only). Returns the figures
-- readable from Postgres: database size vs the free-tier quota, jobs table size/rows, and
-- current vs max connections. CPU/memory/IOPS live outside Postgres and are not included.
create or replace function public.get_infra_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  max_conn int;
  total_conn int;
begin
  if get_my_role() <> 'manager' then
    raise exception 'not authorized';
  end if;
  select setting::int into max_conn from pg_settings where name = 'max_connections';
  select count(*) into total_conn from pg_stat_activity;
  return jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'jobs_bytes', pg_total_relation_size('public.jobs'),
    'jobs_rows', (select count(*) from public.jobs),
    'total_connections', total_conn,
    'max_connections', max_conn,
    'free_quota_bytes', 524288000,
    'as_of', now()
  );
end;
$$;

revoke all on function public.get_infra_stats() from public;
grant execute on function public.get_infra_stats() to authenticated;
