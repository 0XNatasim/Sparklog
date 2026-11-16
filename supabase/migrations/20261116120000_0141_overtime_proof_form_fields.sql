-- 0141: the overtime proof is now a screenshot of the overtime request form (V2.4.262).
--
-- The Edge function `process_overtime_evidence` reads the screenshot (OCR) and keeps only three numbers, never the raw
-- text: the OT number, the minutes at the client and the return minutes written on the form. The manager screens compare
-- them with what Sparklog calculates for the day and raise an alert « À vérifier avant d'approuver » when they differ
-- (alert only, nothing is blocked). `proof_read_at` is set whenever the new reader ran, so older SMS proofs (no value,
-- no date) are never compared.
alter table public.overtime_evidence
  add column if not exists proof_ot text,
  add column if not exists proof_client_minutes integer,
  add column if not exists proof_return_minutes integer,
  add column if not exists proof_read_at timestamptz;

alter table public.overtime_evidence drop constraint if exists overtime_evidence_proof_fields_chk;
alter table public.overtime_evidence add constraint overtime_evidence_proof_fields_chk
  check (
    (proof_ot is null or proof_ot ~ '^[0-9]{3,8}$')
    and (proof_client_minutes is null or proof_client_minutes between 0 and 9999)
    and (proof_return_minutes is null or proof_return_minutes between 0 and 9999)
  );

-- An employee may insert his own proof row (policy « employee insert »): whatever he sends for the read values is dropped,
-- so only the Edge function (service role, later UPDATE) can fill them. Updates are not touched.
create or replace function public.overtime_evidence_guard_proof_fields()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.proof_ot := null;
  new.proof_client_minutes := null;
  new.proof_return_minutes := null;
  new.proof_read_at := null;
  return new;
end;
$$;

drop trigger if exists overtime_evidence_guard_proof_fields on public.overtime_evidence;
create trigger overtime_evidence_guard_proof_fields
  before insert on public.overtime_evidence
  for each row execute function public.overtime_evidence_guard_proof_fields();
