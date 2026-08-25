alter table public.manager_notifications
  add column if not exists parking_receipt_id uuid references public.parking_receipts(id) on delete cascade;

alter table public.meal_claims
  alter column status set default 'approved',
  alter column payroll_treatment set default 'expense_reimbursement';

update public.meal_claims
set status = 'approved',
    payroll_treatment = 'expense_reimbursement',
    reviewed_by = null,
    reviewed_at = null
where status = 'pending';

alter table public.jobs disable trigger jobs_enforce_entry_window;

update public.jobs as job
set meal_claim_captured = true
where exists (
  select 1 from public.meal_claims as claim where claim.job_id = job.id
);

alter table public.jobs enable trigger jobs_enforce_entry_window;
