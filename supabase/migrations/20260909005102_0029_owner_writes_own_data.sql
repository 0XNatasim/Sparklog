-- 0029: finish the ownership-based write sweep for personal data.
--
-- Several "own data" write policies were gated by is_active_employee() (role =
-- 'employee'), so a manager who also works in the field (e.g. Simon B.) was blocked
-- from writing their OWN records — even though every one of these policies already
-- restricts the row to the caller (user_id/employee_id = auth.uid(), or folder =
-- auth.uid(), plus a job-ownership EXISTS check). The role gate added nothing but the
-- bug. Following 0027 (jobs delete) and 0028 (evidence storage), replace it with
-- is_not_paused() so any non-paused owner may write their own rows, while paused
-- accounts stay contained. Read/manager policies are untouched.
--
-- Deliberately NOT changed: profiles (a manager already self-updates via
-- "profiles: manager update all"; widening the "own update" path would only add
-- self-edit surface for role/rate columns) and jobs insert/update (managers already
-- have "jobs: manager insert" / "jobs: manager update all").

-- manager_notifications: raised by the employee when submitting their own job.
drop policy if exists "notifications: employee insert" on public.manager_notifications;
create policy "notifications: owner insert"
on public.manager_notifications
for insert
with check (
  public.is_not_paused()
  and employee_id = auth.uid()
  and exists (select 1 from public.jobs where jobs.id = manager_notifications.job_id and jobs.user_id = auth.uid())
);

-- meal_claims: created for the caller's own job.
drop policy if exists "meal claims: employee insert" on public.meal_claims;
create policy "meal claims: owner insert"
on public.meal_claims
for insert
with check (
  public.is_not_paused()
  and user_id = auth.uid()
  and exists (select 1 from public.jobs where jobs.id = meal_claims.job_id and jobs.user_id = auth.uid())
);

-- overtime_evidence: the DB record paired with the overtime screenshot.
drop policy if exists "overtime evidence: employee insert" on public.overtime_evidence;
create policy "overtime evidence: owner insert"
on public.overtime_evidence
for insert
with check (
  public.is_not_paused()
  and user_id = auth.uid()
  and exists (select 1 from public.jobs where jobs.id = overtime_evidence.job_id and jobs.user_id = auth.uid())
);

-- parking_receipts: insert + update of the caller's own receipt.
drop policy if exists "parking receipts: employee insert" on public.parking_receipts;
create policy "parking receipts: owner insert"
on public.parking_receipts
for insert
with check (
  public.is_not_paused()
  and user_id = auth.uid()
  and exists (select 1 from public.jobs where jobs.id = parking_receipts.job_id and jobs.user_id = auth.uid())
);

drop policy if exists "parking receipts: employee update" on public.parking_receipts;
create policy "parking receipts: owner update"
on public.parking_receipts
for update
using (public.is_not_paused() and user_id = auth.uid())
with check (public.is_not_paused() and user_id = auth.uid());

-- Storage: meal-receipts and ccq-cards uploads into the caller's own folder.
drop policy if exists "meal storage: employee upload" on storage.objects;
create policy "meal storage: owner upload"
on storage.objects
for insert
with check (
  bucket_id = 'meal-receipts'
  and public.is_not_paused()
  and (storage.foldername(name))[1] = (auth.uid())::text
);

drop policy if exists "ccq cards: employee upload" on storage.objects;
create policy "ccq cards: owner upload"
on storage.objects
for insert
with check (
  bucket_id = 'ccq-cards'
  and public.is_not_paused()
  and (storage.foldername(name))[1] = (auth.uid())::text
);
