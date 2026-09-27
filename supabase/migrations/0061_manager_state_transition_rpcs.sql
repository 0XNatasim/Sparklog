-- Replace broad manager UPDATE policies with narrow, state-aware transitions.
-- Each RPC authenticates the actor, locks the target row, verifies the expected
-- state, and lets the first valid transition win.

-- Approval is performed by the batch Edge Function with the caller's id stored in
-- exported_by. Service-role writes have no auth.uid(), so use that verified actor for
-- the audit row rather than recording a null approver.
create or replace function public.audit_job_status()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare actor uuid := coalesce(auth.uid(), new.exported_by);
begin
  if new.status is distinct from old.status and new.status = 'approved' then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
    values (actor, public.audit_actor_name(actor), 'job_approved', new.user_id, public.audit_actor_name(new.user_id),
            new.id, jsonb_build_object('job_date', new.job_date, 'ot', new.ot));
  end if;
  return new;
end;
$$;

create or replace function public.return_job_for_correction(
  p_job_id uuid,
  p_expected_updated_at timestamptz
)
returns table (id uuid, status text, locked boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  current_job public.jobs%rowtype;
  changed_job public.jobs%rowtype;
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

  insert into public.audit_log
    (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values
    (actor_id, public.audit_actor_name(actor_id), 'job_returned_for_correction',
     changed_job.user_id, public.audit_actor_name(changed_job.user_id), changed_job.id,
     jsonb_build_object('from', current_job.status, 'to', changed_job.status,
                        'job_date', changed_job.job_date, 'ot', changed_job.ot));

  return query select changed_job.id, changed_job.status, changed_job.locked, changed_job.updated_at;
end;
$function$;

create or replace function public.review_meal_claim(
  p_claim_id uuid,
  p_decision text,
  p_payroll_treatment text default null
)
returns table (id uuid, status text, payroll_treatment text, reviewed_by uuid, reviewed_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  current_claim public.meal_claims%rowtype;
  changed_claim public.meal_claims%rowtype;
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_review_decision';
  end if;
  if p_decision = 'approved'
     and coalesce(p_payroll_treatment, '') not in ('expense_reimbursement', 'taxable_benefit') then
    raise exception using errcode = '22023', message = 'invalid_payroll_treatment';
  end if;

  select * into current_claim from public.meal_claims c where c.id = p_claim_id for update;
  if current_claim.id is null then
    raise exception using errcode = 'P0002', message = 'meal_claim_not_found';
  end if;
  if current_claim.status <> 'pending' then
    raise exception using errcode = '40001', message = 'meal_claim_already_reviewed';
  end if;

  update public.meal_claims c
     set status = p_decision,
         payroll_treatment = case when p_decision = 'approved' then p_payroll_treatment else null end,
         reviewed_by = actor_id,
         reviewed_at = now()
   where c.id = current_claim.id
   returning * into changed_claim;

  return query select changed_claim.id, changed_claim.status, changed_claim.payroll_treatment,
                      changed_claim.reviewed_by, changed_claim.reviewed_at;
end;
$function$;

create or replace function public.review_parking_claim(
  p_job_id uuid,
  p_decision text
)
returns table (id uuid, job_id uuid, status text, reviewed_by uuid, reviewed_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  current_claim public.parking_receipts%rowtype;
  changed_claim public.parking_receipts%rowtype;
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_review_decision';
  end if;

  select * into current_claim from public.parking_receipts p where p.job_id = p_job_id for update;
  if current_claim.id is null then
    raise exception using errcode = 'P0002', message = 'parking_claim_not_found';
  end if;
  if current_claim.status <> 'pending' then
    raise exception using errcode = '40001', message = 'parking_claim_already_reviewed';
  end if;

  update public.parking_receipts p
     set status = p_decision, reviewed_by = actor_id, reviewed_at = now()
   where p.id = current_claim.id
   returning * into changed_claim;

  return query select changed_claim.id, changed_claim.job_id, changed_claim.status,
                      changed_claim.reviewed_by, changed_claim.reviewed_at;
end;
$function$;

revoke all on function public.return_job_for_correction(uuid, timestamptz) from public, anon;
revoke all on function public.review_meal_claim(uuid, text, text) from public, anon;
revoke all on function public.review_parking_claim(uuid, text) from public, anon;
grant execute on function public.return_job_for_correction(uuid, timestamptz) to authenticated;
grant execute on function public.review_meal_claim(uuid, text, text) to authenticated;
grant execute on function public.review_parking_claim(uuid, text) to authenticated;

-- Service-role Edge Functions bypass RLS. Browser managers must use the explicit
-- transitions above rather than rewriting arbitrary job/claim facts.
drop policy if exists "jobs: manager update all" on public.jobs;
drop policy if exists "jobs: manager insert" on public.jobs;
drop policy if exists "meal claims: manager update" on public.meal_claims;
drop policy if exists "parking receipts: manager update" on public.parking_receipts;

-- Keep employee receipt replacement possible while preventing the owner-role
-- manager mapping from using this own-row policy to forge a review decision.
drop policy if exists "parking receipts: owner update" on public.parking_receipts;
create policy "parking receipts: owner update pending"
on public.parking_receipts for update to authenticated
using (
  public.is_not_paused() and user_id = auth.uid() and status = 'pending'
)
with check (
  public.is_not_paused() and user_id = auth.uid() and status = 'pending'
  and reviewed_by is null and reviewed_at is null
);
