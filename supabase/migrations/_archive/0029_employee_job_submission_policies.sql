-- Employee access to jobs. Employees may create and read their own jobs,
-- update only unlocked drafts, and delete only unlocked drafts.
drop policy if exists "jobs: employee insert own" on public.jobs;
create policy "jobs: employee insert own"
  on public.jobs for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (status in ('saved', 'updated') and locked = false)
      or (status = 'submitted' and locked = true)
    )
  );

drop policy if exists "jobs: employee update own editable" on public.jobs;
create policy "jobs: employee update own editable"
  on public.jobs for update to authenticated
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

drop policy if exists "jobs: employee read own" on public.jobs;
create policy "jobs: employee read own"
  on public.jobs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "jobs: employee delete own editable" on public.jobs;
create policy "jobs: employee delete own editable"
  on public.jobs for delete to authenticated
  using (
    user_id = auth.uid()
    and locked = false
    and status in ('saved', 'updated')
  );
