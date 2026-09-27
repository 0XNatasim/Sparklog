-- One aggregate query replaces four exact-count scans in the manager timesheet.
create or replace function public.manager_job_counts(
  p_employee_id uuid default null,
  p_job_date date default null
)
returns table (all_count bigint, saved_count bigint, submitted_count bigint, approved_count bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;
  return query
    select count(*),
           count(*) filter (where j.status in ('saved', 'updated')),
           count(*) filter (where j.status = 'submitted'),
           count(*) filter (where j.status = 'approved')
      from public.jobs j
     where (p_employee_id is null or j.user_id = p_employee_id)
       and (p_job_date is null or j.job_date = p_job_date);
end;
$function$;

revoke all on function public.manager_job_counts(uuid, date) from public, anon;
grant execute on function public.manager_job_counts(uuid, date) to authenticated;

-- Review queues sort newest-first and frequently filter pending rows.
create index if not exists overtime_evidence_created_idx
  on public.overtime_evidence (created_at desc, job_id);
create index if not exists parking_receipts_pending_created_idx
  on public.parking_receipts (created_at desc, job_id) where status = 'pending';
create index if not exists meal_claims_pending_created_idx
  on public.meal_claims (created_at desc, job_id) where status = 'pending';

-- Stable keyset order for manager paging; unlike OFFSET it cannot skip/duplicate rows
-- merely because another job was inserted ahead of the current page.
create index if not exists jobs_manager_keyset_idx
  on public.jobs (job_date desc, id desc);

