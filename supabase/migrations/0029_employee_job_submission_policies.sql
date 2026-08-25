-- Employees create jobs as either drafts or immediately submitted entries.  A
-- submitted entry is locked by the client in the same INSERT, so an INSERT
-- policy that only accepts unlocked rows rejects the "Save and submit" path.
-- The drops make this migration safe when its SQL was already run manually in
-- the Supabase SQL editor before `supabase db push` records the migration.
drop policy if exists "jobs: employee insert own" on public.jobs;
drop policy if exists "jobs: employee update own editable" on public.jobs;
drop policy if exists "jobs: employee read own" on public.jobs;
drop policy if exists "jobs: employee delete own editable" on public.jobs;

create policy "jobs: employee insert own"
  on public.jobs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      (status = 'saved' and locked = false)
      or (status = 'submitted' and locked = true)
    )
  );

-- USING is evaluated against the existing row, while WITH CHECK is evaluated
-- against the replacement row.  This permits an employee to lock an editable
-- draft by submitting it, but never permits a locked row to be edited again.
create policy "jobs: employee update own editable"
  on public.jobs
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and locked = false
    and status in ('saved', 'updated')
  )
  with check (
    user_id = auth.uid()
    and (
      (status in ('saved', 'updated') and locked = false)
      or (status = 'submitted' and locked = true)
    )
  );

create policy "jobs: employee read own"
  on public.jobs
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "jobs: employee delete own editable"
  on public.jobs
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and locked = false
    and status in ('saved', 'updated')
  );
