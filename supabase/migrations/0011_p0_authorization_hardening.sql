-- P0 authorization hardening. Every check is guarded so it only fires for an
-- authenticated NON-manager user; managers and the service role (Edge Functions,
-- where auth.uid() is null) pass through untouched. The app's employee flows do
-- not write any of the protected columns, so legitimate use is unaffected.

-- 1. Employees cannot change privileged profile fields (role escalation, pay…).
create or replace function public.protect_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and public.get_my_role() is distinct from 'manager' and (
       new.role is distinct from old.role
    or new.is_paused is distinct from old.is_paused
    or new.hourly_rate is distinct from old.hourly_rate
    or new.km_rate is distinct from old.km_rate
    or new.wage_schedule is distinct from old.wage_schedule
    or new.apprentice_level is distinct from old.apprentice_level
    or new.storage_compensation is distinct from old.storage_compensation
    or new.nas_employee is distinct from old.nas_employee
  ) then
    raise exception 'Only managers can change these profile fields';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();
revoke all on function public.protect_profile_privileged_fields() from public, anon, authenticated;

-- 2. Employees cannot set export/approval fields on jobs.
create or replace function public.protect_job_manager_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and public.get_my_role() is distinct from 'manager' then
    if tg_op = 'INSERT' then
      if coalesce(new.exported_to_sheet, false) = true
         or new.exported_at is not null
         or new.exported_by is not null
         or new.status = 'approved' then
        raise exception 'Employees cannot set export or approval fields on jobs';
      end if;
    else
      if new.exported_to_sheet is distinct from old.exported_to_sheet
         or new.exported_at is distinct from old.exported_at
         or new.exported_by is distinct from old.exported_by
         or (new.status = 'approved' and old.status is distinct from 'approved') then
        raise exception 'Employees cannot set export or approval fields on jobs';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_protect_manager_fields on public.jobs;
create trigger jobs_protect_manager_fields before insert or update on public.jobs
  for each row execute function public.protect_job_manager_fields();
revoke all on function public.protect_job_manager_fields() from public, anon, authenticated;

-- 3 (partial). Employees cannot change a parking receipt's review fields.
create or replace function public.protect_parking_review_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and public.get_my_role() is distinct from 'manager' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'pending') <> 'pending'
         or new.reviewed_by is not null
         or new.reviewed_at is not null then
        raise exception 'Employees cannot set parking review fields';
      end if;
    else
      if new.status is distinct from old.status
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Employees cannot set parking review fields';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists parking_protect_review_fields on public.parking_receipts;
create trigger parking_protect_review_fields before insert or update on public.parking_receipts
  for each row execute function public.protect_parking_review_fields();
revoke all on function public.protect_parking_review_fields() from public, anon, authenticated;

-- 4 (partial). Employees cannot change a meal claim's review fields after it is
-- created. NOTE: the app still creates meals as approved on insert; converting
-- meals to a pending/manager-approved workflow is a separate coordinated change
-- (app + db) so it does not break the current in-use flow.
create or replace function public.protect_meal_review_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and public.get_my_role() is distinct from 'manager' then
    if new.status is distinct from old.status
       or new.payroll_treatment is distinct from old.payroll_treatment
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Employees cannot change meal claim review fields';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists meal_protect_review_fields on public.meal_claims;
create trigger meal_protect_review_fields before update on public.meal_claims
  for each row execute function public.protect_meal_review_fields();
revoke all on function public.protect_meal_review_fields() from public, anon, authenticated;

-- 5. Remove the overly-broad CCQ snapshot INSERT policy; only the service role
-- (which bypasses RLS) should write snapshots. Frontend reads are unaffected.
drop policy if exists "ccq_rate_snapshots: service insert" on public.ccq_rate_snapshots;
revoke insert, update, delete on public.ccq_rate_snapshots from anon, authenticated;
