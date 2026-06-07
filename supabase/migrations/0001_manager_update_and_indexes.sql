-- Manager UPDATE policy on jobs.
-- Without this, manager approvals silently fail at the DB layer after the
-- Google Sheets export already succeeded, leaving rows in a desynced state.
create policy "jobs: manager update all"
  on public.jobs
  for update
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');

-- Indexes for the access patterns used by the dashboard, history, and week views.
create index if not exists jobs_user_date_idx
  on public.jobs (user_id, job_date desc);

create index if not exists jobs_status_date_idx
  on public.jobs (status, job_date desc);
