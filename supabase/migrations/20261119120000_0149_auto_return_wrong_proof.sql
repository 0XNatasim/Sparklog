-- 0149: automatic return of a submitted job whose overtime proof is « wrong_document » (0148), behind an on/off switch.
-- The switch lives on the singleton overtime_settings row (readable by every signed-in account, writable by managers
-- through the existing policies) and is OFF by default. The reader (process_overtime_evidence, service role) calls
-- auto_return_wrong_proof(proof_id) after classifying a picture as a wrong document.

alter table public.overtime_settings
  add column if not exists auto_return_wrong_proof boolean not null default false;

create or replace function public.auto_return_wrong_proof(p_proof_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  proof public.overtime_evidence%rowtype;
  current_job public.jobs%rowtype;
  enabled boolean;
begin
  select coalesce(s.auto_return_wrong_proof, false) into enabled from public.overtime_settings s where s.id = true;
  if enabled is not true then
    return 'disabled';
  end if;

  select * into proof from public.overtime_evidence e where e.id = p_proof_id;
  if proof.id is null or proof.ocr_status <> 'wrong_document' or proof.job_id is null then
    return 'not_wrong_document';
  end if;

  select * into current_job from public.jobs j where j.id = proof.job_id for update;
  -- Only a job waiting for review goes back: a draft is the employee's own, an approved or exported job is never rewritten.
  if current_job.id is null or current_job.status <> 'submitted' then
    return 'job_not_submitted';
  end if;

  -- The wrong picture no longer counts as the proof (the submission rule looks for a proof row of the job).
  delete from public.overtime_evidence e where e.id = proof.id;
  if exists (select 1 from public.overtime_evidence e where e.job_id = current_job.id) then
    -- Another proof is still on the job: nothing is missing, only the wrong picture is dropped.
    return 'other_proof_kept';
  end if;

  update public.jobs j
     set status = 'updated', locked = false, overtime_evidence_captured = false
   where j.id = current_job.id;

  insert into public.audit_log
    (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values
    (null, 'Système', 'job_returned_wrong_proof',
     current_job.user_id, public.audit_actor_name(current_job.user_id), current_job.id,
     jsonb_build_object('from', 'submitted', 'to', 'updated', 'job_date', current_job.job_date,
                        'ot', current_job.ot, 'proof_id', proof.id, 'proof_ot', proof.proof_ot));
  return 'returned';
end;
$function$;

revoke all on function public.auto_return_wrong_proof(uuid) from public, anon, authenticated;
grant execute on function public.auto_return_wrong_proof(uuid) to service_role;
