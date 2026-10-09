-- 0078: Owner can delete an emergency timesheet that the employee has not validated yet.
--
-- Only a pending owner-created draft (manager_entry_at set, not confirmed by the employee,
-- status saved/updated, unlocked) can be removed; once the employee confirmed/submitted it,
-- it is part of the normal approval circuit and this RPC refuses (job_state_changed).
-- Owner-only (is_privileged), row-locked, audited. The day unlock opened for the employee
-- by the creation is closed again when no other owner-created draft needs it.

create or replace function public.delete_manager_entry(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  current_job public.jobs%rowtype;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;

  select * into current_job from public.jobs j where j.id = p_job_id for update;
  if current_job.id is null or current_job.manager_entry_at is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if current_job.employee_confirmed_at is not null
     or current_job.locked
     or current_job.status not in ('saved', 'updated') then
    raise exception using errcode = '40001', message = 'job_state_changed';
  end if;

  actor_name := public.audit_actor_name(actor_id);

  delete from public.jobs j where j.id = current_job.id;

  -- Close the 14-day unlock created for this draft unless another owner-created draft
  -- of that employee/day still needs it. Unlocks from other sources are left alone.
  delete from public.job_entry_unlocks u
   where u.user_id = current_job.user_id
     and u.job_date = current_job.job_date
     and u.reason = 'manager_entry'
     and not exists (
       select 1 from public.jobs o
        where o.user_id = current_job.user_id
          and o.job_date = current_job.job_date
          and o.manager_entry_at is not null
          and o.employee_confirmed_at is null
     );

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'manager_entry_deleted', current_job.user_id,
          public.audit_actor_name(current_job.user_id), null,
          jsonb_build_object('job_date', current_job.job_date, 'ot', current_job.ot,
                             'depart', current_job.depart, 'fin', current_job.fin,
                             'deleted_job_id', current_job.id));
end;
$function$;

revoke all on function public.delete_manager_entry(uuid) from public, anon;
grant execute on function public.delete_manager_entry(uuid) to authenticated;
