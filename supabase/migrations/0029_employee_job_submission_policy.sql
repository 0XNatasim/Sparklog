-- Employees may update their own unlocked drafts and submit them.  The row
-- produced by submission is intentionally locked, so the WITH CHECK clause
-- must accept that final state even though later employee edits remain denied.
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

-- Receipt rows are the source of truth for the job-card icons.  Security
-- definer trigger functions update only the corresponding capture flag, so an
-- employee never needs UPDATE access to an already submitted/locked job.
create or replace function public.mark_job_parking_receipt_captured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs set parking_receipt_captured = true where id = new.job_id;
  return new;
end;
$$;

drop trigger if exists parking_receipts_mark_job on public.parking_receipts;
create trigger parking_receipts_mark_job
after insert or update of job_id on public.parking_receipts
for each row execute function public.mark_job_parking_receipt_captured();

create or replace function public.mark_job_meal_claim_captured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs set meal_claim_captured = true where id = new.job_id;
  return new;
end;
$$;

drop trigger if exists meal_claims_mark_job on public.meal_claims;
create trigger meal_claims_mark_job
after insert or update of job_id on public.meal_claims
for each row execute function public.mark_job_meal_claim_captured();
