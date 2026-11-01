-- 0129: alert for the proofs not downloaded yet (V2.4.219).
--
-- Overtime screenshots and parking receipt pictures are deleted after the retention (30 days by default). The managers
-- download them (« Télécharger les justificatifs », 0126). This counts, for a manager session, the pictures still kept and
-- NOT downloaded that are `p_days` days old or more (21 by default), or that will be deleted within 3 days whatever the
-- retention is, so the app can warn before they disappear. Anyone else gets zeros. Counts only: no path, no name.

create or replace function public.evidence_download_alert(p_days integer default 21)
returns table(total integer, overtime integer, parking integer, oldest_days integer, days_left integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if public.get_my_role() is distinct from 'manager' then
    return query select 0, 0, 0, 0, null::integer;
    return;
  end if;
  return query
  with files as (
    select 'overtime-evidence'::text as bucket, e.storage_path as path, e.created_at, e.expires_at
      from public.overtime_evidence e where e.expires_at > now()
    union all
    select 'parking-receipts', p.path, r.created_at, r.expires_at
      from public.parking_receipts r cross join lateral unnest(array[r.storage_path] || r.extra_storage_paths) as p(path)
      where r.storage_path is not null and r.expires_at > now()
  ), pending as (
    select f.* from files f
    where (f.created_at <= now() - make_interval(days => greatest(1, p_days)) or f.expires_at <= now() + interval '3 days')
      and not exists (select 1 from public.evidence_downloads d where d.bucket = f.bucket and d.storage_path = f.path)
  )
  select count(*)::integer,
    (count(*) filter (where bucket = 'overtime-evidence'))::integer,
    (count(*) filter (where bucket = 'parking-receipts'))::integer,
    coalesce(max(extract(day from now() - created_at))::integer, 0),
    min(greatest(0, ceil(extract(epoch from expires_at - now()) / 86400)))::integer
  from pending;
end;
$$;

revoke all on function public.evidence_download_alert(integer) from public, anon;
grant execute on function public.evidence_download_alert(integer) to authenticated;
