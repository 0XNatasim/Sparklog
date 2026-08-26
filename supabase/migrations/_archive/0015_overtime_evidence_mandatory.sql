-- Overtime SMS evidence is mandatory for every employee; keep the legacy
-- setting locked on so historical deployments cannot retain opt-outs.
update public.profiles set overtime_evidence_required = true
where overtime_evidence_required is distinct from true;

alter table public.profiles
  alter column overtime_evidence_required set default true,
  drop constraint if exists profiles_overtime_evidence_mandatory,
  add constraint profiles_overtime_evidence_mandatory check (overtime_evidence_required = true);
