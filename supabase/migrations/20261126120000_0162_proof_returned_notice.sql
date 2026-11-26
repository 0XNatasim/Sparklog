-- 0162: the employee is told, with a notification, when a manager sends back a job because of its overtime proof.
-- It rides on the existing manager messages (manager_broadcasts + broadcast_recipients: bell, pop-up that comes back until OK,
-- phone push) with a kind: the app then adds the OT, the date, the reason and the two example captures to the message.
--   kind = 'proof_returned', meta = { job_id, ot, job_date, reason }  (reason = a short code the app translates, or null)
-- Two ways to send a job back for its proof now write that message: the manager's « Renvoyer pour correction » of the OCR tab
-- (return_job_for_proof, same rules as return_job_for_correction) and the automatic return of a wrong picture (0149).

alter table public.manager_broadcasts
  add column if not exists kind text,
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.manager_broadcasts drop constraint if exists manager_broadcasts_kind_check;
alter table public.manager_broadcasts
  add constraint manager_broadcasts_kind_check check (kind is null or kind = 'proof_returned');

comment on column public.manager_broadcasts.kind is 'null = a message written by a manager; proof_returned = overtime proof sent back (written by the server).';

-- Writes the message for one employee (internal: no grant to the browser). Returns the broadcast id.
create or replace function public.notify_proof_returned(p_actor uuid, p_job_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  job public.jobs%rowtype;
  clean_reason text;
  new_broadcast uuid;
  ot_text text;
begin
  select * into job from public.jobs j where j.id = p_job_id;
  if job.id is null then return null; end if;
  clean_reason := case when p_reason in ('incomplete', 'unread', 'mismatch', 'wrongDoc', 'field', 'sms', 'oldForm') then p_reason else null end;
  ot_text := coalesce(nullif(btrim(job.ot), ''), '—');

  insert into public.manager_broadcasts (sender_id, body, audience, kind, meta)
  values (
    p_actor,
    'La preuve de temps supplémentaire de l''OT ' || ot_text || ' (' || to_char(job.job_date, 'YYYY-MM-DD') || ') n''est pas admissible. '
      || 'Ouvrez l''Historique, touchez l''horloge de cet OT et remplacez-la par 2 nouvelles captures du formulaire '
      || '(capture 1 : l''OT et le temps coché ; capture 2 : le retour coché), prises AVANT d''appuyer sur « Envoyer ».'
      || E'\n\n'
      || 'The overtime proof of OT ' || ot_text || ' (' || to_char(job.job_date, 'YYYY-MM-DD') || ') is not accepted. '
      || 'Open History, tap the clock of that OT and replace it with 2 new screenshots of the form '
      || '(screenshot 1: the OT and the ticked time; screenshot 2: the ticked return), taken BEFORE you press « Submit ».',
    'selected', 'proof_returned',
    jsonb_build_object('job_id', job.id, 'ot', ot_text, 'job_date', job.job_date, 'reason', clean_reason)
  )
  returning manager_broadcasts.id into new_broadcast;
  insert into public.broadcast_recipients (broadcast_id, employee_id) values (new_broadcast, job.user_id);
  return new_broadcast;
end;
$function$;
revoke all on function public.notify_proof_returned(uuid, uuid, text) from public, anon, authenticated;

-- The manager sends a submitted job back because of its overtime proof: same transition and same stale-state check as
-- return_job_for_correction (0061), plus the message to the employee.
create or replace function public.return_job_for_proof(
  p_job_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text default null
)
returns table (id uuid, status text, locked boolean, updated_at timestamptz, broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  current_job public.jobs%rowtype;
  changed_job public.jobs%rowtype;
  new_broadcast uuid;
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;

  select * into current_job from public.jobs j where j.id = p_job_id for update;
  if current_job.id is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if p_expected_updated_at is null
     or current_job.status <> 'submitted' or not current_job.locked
     or current_job.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'job_state_changed';
  end if;

  update public.jobs j
     set status = 'updated', locked = false
   where j.id = current_job.id
   returning * into changed_job;

  new_broadcast := public.notify_proof_returned(actor_id, changed_job.id, p_reason);

  insert into public.audit_log
    (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values
    (actor_id, public.audit_actor_name(actor_id), 'job_returned_for_correction',
     changed_job.user_id, public.audit_actor_name(changed_job.user_id), changed_job.id,
     jsonb_build_object('from', current_job.status, 'to', changed_job.status,
                        'job_date', changed_job.job_date, 'ot', changed_job.ot, 'reason', 'overtime_proof', 'reason_code', p_reason));

  return query select changed_job.id, changed_job.status, changed_job.locked, changed_job.updated_at, new_broadcast;
end;
$function$;
revoke all on function public.return_job_for_proof(uuid, timestamptz, text) from public, anon;
grant execute on function public.return_job_for_proof(uuid, timestamptz, text) to authenticated;

-- The automatic return of a wrong picture (0149) also writes the message (reason: wrongDoc).
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

  perform public.notify_proof_returned(null, current_job.id, 'wrongDoc');

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
