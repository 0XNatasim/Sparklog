-- Cover every foreign key with an index (flagged by the performance advisor). Reduces
-- disk-heavy sequential scans on lookups/joins/cascades, cutting sustained disk IO.
create index if not exists idx_employee_form_access_employee_id on public.employee_form_access(employee_id);
create index if not exists idx_job_entry_unlocks_created_by on public.job_entry_unlocks(created_by);
create index if not exists idx_jobs_exported_by on public.jobs(exported_by);
create index if not exists idx_manager_broadcasts_sender_id on public.manager_broadcasts(sender_id);
create index if not exists idx_manager_notification_reads_manager_id on public.manager_notification_reads(manager_id);
create index if not exists idx_manager_notifications_employee_id on public.manager_notifications(employee_id);
create index if not exists idx_manager_notifications_evidence_id on public.manager_notifications(evidence_id);
create index if not exists idx_manager_notifications_job_id on public.manager_notifications(job_id);
create index if not exists idx_manager_notifications_meal_claim_id on public.manager_notifications(meal_claim_id);
create index if not exists idx_manager_notifications_parking_receipt_id on public.manager_notifications(parking_receipt_id);
create index if not exists idx_meal_claims_job_id on public.meal_claims(job_id);
create index if not exists idx_meal_claims_reviewed_by on public.meal_claims(reviewed_by);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_overtime_evidence_user_id on public.overtime_evidence(user_id);
create index if not exists idx_parking_receipts_reviewed_by on public.parking_receipts(reviewed_by);
create index if not exists idx_parking_receipts_user_id on public.parking_receipts(user_id);
create index if not exists idx_payroll_period_ledger_boss_approved_by on public.payroll_period_ledger(boss_approved_by);
