-- 0143: several overtime proofs on one day (V2.4.269, Phase 9a).
--
-- Until now a day carried ONE overtime proof (screenshot of the overtime request form): `overtime_evidence.job_id` was
-- unique, and the trigger of 0068 moves every proof of the day onto the day's last job. An employee whose day has two
-- work orders past the 8 h line now gives one screenshot per such work order (2 for the day), so a job may hold several
-- proofs. The day-level rules are unchanged: the proofs still sit on the day's last job (0068), they are all removed when
-- the whole day is back to 8 h or less (reconcile_overtime_evidence), a deleted job hands its proofs to another job of the
-- day (0067), and the database still asks for AT LEAST ONE proof to submit a day over the threshold (validate_job_submission_contract).
-- Refusing a day that has fewer proofs than work orders past the line is the next step (Phase 9b).
--
-- Order of deployment: apply this migration BEFORE the code that asks for a second proof.
alter table public.overtime_evidence drop constraint if exists overtime_evidence_job_id_key;
create index if not exists overtime_evidence_job_id_idx on public.overtime_evidence (job_id);
create index if not exists overtime_evidence_user_day_idx on public.overtime_evidence (user_id, job_date);
