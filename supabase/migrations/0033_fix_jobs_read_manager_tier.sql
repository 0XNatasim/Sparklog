-- 0033: fix the jobs read-all policy so manager-tier roles (admin, owner) can read
-- every user's jobs.
--
-- The baseline "jobs: manager read all" policy (0000:448) checked
-- `profiles.role = 'manager'` DIRECTLY, bypassing get_my_role(). Every OTHER manager
-- policy routes through get_my_role(), which collapses admin/owner -> manager — but this
-- one did not, so it never covered the manager-tier roles. After 0032 promoted the
-- owners from 'manager' to 'owner', they stopped matching `role = 'manager'` and lost
-- visibility of other users' jobs (the manager timesheet came back empty).
--
-- Route it through get_my_role() like its sibling insert/update policies so manager,
-- admin and owner all read all jobs, while employees keep falling back to their own-row
-- read policy.
drop policy if exists "jobs: manager read all" on public.jobs;
create policy "jobs: manager read all" on public.jobs for select to public
  using (public.get_my_role() = 'manager');
