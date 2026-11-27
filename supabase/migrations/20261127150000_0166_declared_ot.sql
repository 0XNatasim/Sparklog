-- 0166: the OT of an overtime proof is typed by the employee (V2.4.341).
--
-- The Microsoft form of 27 November 2026 no longer asks « 1. Ordre de travail »: the screenshot shows only the real overtime
-- duration at the client (question 2) and the return duration (question 3). The employee now types the work order the overtime
-- is for BEFORE the proof page, and it is kept here, next to the proof, as `declared_ot` (digits only). It is the employee's own
-- declaration, never a reading of the picture: `proof_ot` stays the OT the reader found on an older form.
-- The RPC is called right after a proof is saved (the proof RPCs of 0144 / 0160 are not touched): it only fills the declared OT
-- of the caller's own proof, while the sheet is editable or the proof is new, and cleans the text (« OT-270825 » → 270825).

alter table public.overtime_evidence add column if not exists declared_ot text;
alter table public.overtime_evidence drop constraint if exists overtime_evidence_declared_ot_chk;
alter table public.overtime_evidence add constraint overtime_evidence_declared_ot_chk
  check (declared_ot is null or declared_ot ~ '^[0-9]{3,8}$');

create or replace function public.set_own_proof_declared_ot(p_evidence_id uuid, p_ot text)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  clean text := regexp_replace(coalesce(p_ot, ''), '[^0-9]', '', 'g');
  proof public.overtime_evidence%rowtype;
  job_row public.jobs%rowtype;
begin
  if uid is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  if clean !~ '^[0-9]{3,8}$' then raise exception using errcode = '22023', message = 'invalid_ot'; end if;
  select * into proof from public.overtime_evidence e where e.id = p_evidence_id and e.user_id = uid;
  if not found then raise exception using errcode = '42501', message = 'evidence_not_found'; end if;
  select * into job_row from public.jobs j where j.id = proof.job_id;
  -- Editable sheet, or a proof just recorded (the job may already be submitted when the proof is sent with it).
  if not (proof.created_at > now() - interval '15 minutes'
          or (found and job_row.status in ('saved', 'updated') and coalesce(job_row.locked, false) = false)) then
    raise exception using errcode = '42501', message = 'job_not_editable';
  end if;
  update public.overtime_evidence set declared_ot = clean where id = p_evidence_id;
end;
$$;

revoke all on function public.set_own_proof_declared_ot(uuid, text) from public, anon;
grant execute on function public.set_own_proof_declared_ot(uuid, text) to authenticated;
