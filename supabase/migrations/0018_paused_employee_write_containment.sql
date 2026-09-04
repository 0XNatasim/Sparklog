-- Block employee-originated writes while an account is paused and replace
-- profile-field blacklisting with an explicit employee-owned whitelist.

create or replace function public.is_active_employee()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employee' and is_paused = false
  );
$$;
revoke all on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated;

create or replace function public.enforce_employee_profile_whitelist()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() = old.id and public.get_my_role() <> 'manager' then
    if not public.is_active_employee() then
      raise exception 'Paused employees cannot update their profile';
    end if;
    if (to_jsonb(new) - array[
          'phone', 'show_on_boards', 'work_region', 'union_association',
          'ccq_number', 'ccq_expiration_date', 'birth_date', 'ccq_card_path',
          'ccq_card_captured_at', 'ccq_renewal_60_sent_for', 'ccq_renewal_30_sent_for'
        ]) is distinct from
       (to_jsonb(old) - array[
          'phone', 'show_on_boards', 'work_region', 'union_association',
          'ccq_number', 'ccq_expiration_date', 'birth_date', 'ccq_card_path',
          'ccq_card_captured_at', 'ccq_renewal_60_sent_for', 'ccq_renewal_30_sent_for'
        ]) then
      raise exception 'Employees may only update approved profile fields';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_privileged_fields on public.profiles;
drop trigger if exists profiles_protect_capture_overrides on public.profiles;
drop trigger if exists profiles_protect_overtime_evidence_settings on public.profiles;
drop trigger if exists profiles_protect_parking_receipt_setting on public.profiles;
drop trigger if exists profiles_enforce_employee_whitelist on public.profiles;
create trigger profiles_enforce_employee_whitelist before update on public.profiles
  for each row execute function public.enforce_employee_profile_whitelist();
revoke all on function public.enforce_employee_profile_whitelist() from public, anon, authenticated;

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update" on public.profiles for update to authenticated
  using (auth.uid() = id and public.is_active_employee())
  with check (auth.uid() = id and public.is_active_employee());

drop policy if exists "jobs: employee insert own" on public.jobs;
-- Remove pre-baseline policy names that may still exist in an upgraded
-- production database; permissive RLS policies combine with OR semantics.
drop policy if exists "jobs: own insert" on public.jobs;
drop policy if exists "jobs: own update unlocked" on public.jobs;
drop policy if exists "jobs: own delete unlocked" on public.jobs;
create policy "jobs: employee insert own" on public.jobs for insert to authenticated
  with check (public.is_active_employee() and user_id = auth.uid()
    and ((status = 'saved' and locked = false) or (status = 'submitted' and locked = true)));
drop policy if exists "jobs: employee update own editable" on public.jobs;
create policy "jobs: employee update own editable" on public.jobs for update to authenticated
  using (public.is_active_employee() and user_id = auth.uid() and locked = false and status in ('saved', 'updated'))
  with check (public.is_active_employee() and user_id = auth.uid()
    and ((status in ('saved', 'updated') and locked = false) or (status = 'submitted' and locked = true)));
drop policy if exists "jobs: employee delete own editable" on public.jobs;
create policy "jobs: employee delete own editable" on public.jobs for delete to authenticated
  using (public.is_active_employee() and user_id = auth.uid() and locked = false and status in ('saved', 'updated'));

drop policy if exists "overtime evidence: employee insert" on public.overtime_evidence;
create policy "overtime evidence: employee insert" on public.overtime_evidence for insert to authenticated
  with check (public.is_active_employee() and user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "meal claims: employee insert" on public.meal_claims;
create policy "meal claims: employee insert" on public.meal_claims for insert to authenticated
  with check (public.is_active_employee() and user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "parking receipts: employee insert" on public.parking_receipts;
create policy "parking receipts: employee insert" on public.parking_receipts for insert to authenticated
  with check (public.is_active_employee() and user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "parking receipts: employee update" on public.parking_receipts;
create policy "parking receipts: employee update" on public.parking_receipts for update to authenticated
  using (public.is_active_employee() and user_id = auth.uid())
  with check (public.is_active_employee() and user_id = auth.uid());
drop policy if exists "notifications: employee insert" on public.manager_notifications;
create policy "notifications: employee insert" on public.manager_notifications for insert to authenticated
  with check (public.is_active_employee() and employee_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));

-- Paused accounts keep permitted reads but cannot create storage objects.
drop policy if exists "ccq cards: employee upload" on storage.objects;
create policy "ccq cards: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ccq-cards' and public.is_active_employee()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "overtime storage: employee upload" on storage.objects;
create policy "overtime storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'overtime-evidence' and public.is_active_employee()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "parking storage: employee upload" on storage.objects;
create policy "parking storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'parking-receipts' and public.is_active_employee()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal storage: employee upload" on storage.objects;
create policy "meal storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-receipts' and public.is_active_employee()
    and (storage.foldername(name))[1] = auth.uid()::text);
