-- 0027: let any owner (employee OR manager) delete their OWN editable job.
--
-- Before: the only DELETE policy on jobs was "employee delete own editable", gated by
-- is_active_employee() (role = 'employee'). A user who is a MANAGER but also logs their
-- own field jobs (e.g. Simon B.) therefore could not delete even their own saved job:
-- the UI showed the Delete button (it keys off ownership), but RLS silently removed 0
-- rows. There is intentionally NO manager-delete-all policy, so this is the only path.
--
-- After: deletion is ownership-based, not role-based. A user may delete a job only when
-- it is THEIR OWN (user_id = auth.uid()), still editable (status saved/updated, unlocked),
-- and they are not a paused/contained account. This lets a manager-who-is-also-an-employee
-- delete their own personal jobs exactly like an employee, while a pure manager (Karine)
-- still can only delete their own personal jobs — never another person's — and submitted
-- or locked jobs remain undeletable by anyone.

-- Owner is any non-paused profile, regardless of employee/manager role. Keeps the paused
-- containment from 0018 (a paused account cannot write) while dropping the role gate.
create or replace function public.is_not_paused()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_paused = false
  );
$function$;

grant execute on function public.is_not_paused() to authenticated;

drop policy if exists "jobs: employee delete own editable" on public.jobs;

create policy "jobs: owner delete own editable"
on public.jobs
for delete
using (
  user_id = auth.uid()
  and locked = false
  and status = any (array['saved'::text, 'updated'::text])
  and public.is_not_paused()
);
