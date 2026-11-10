-- 0133: foreman (contremaître) role.
--
-- A foreman records time like an employee (employee RLS tier) and is paid at least 8 h for every weekday
-- worked (payroll engine 2.8.0, overtimeOptionsFromProfile -> minDayMinutes). Overtime and its proof work as
-- for everyone; the Field Service capture is optional (no manual-entry star).
-- Apply BEFORE deploying the code: the role check must accept 'foreman'.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('employee', 'foreman', 'subcontractor_1', 'manager', 'admin', 'owner'));

-- Same mapping as 0103; a foreman is in the employee tier.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
           when p.role in ('owner', 'manager')
             or (p.role = 'admin' and coalesce(array_length(p.admin_sections, 1), 0) > 0)
             then case when public.session_is_aal2() then 'manager' else 'employee' end
           when p.role in ('admin', 'subcontractor_1', 'foreman') then 'employee'
           else p.role
         end
    from public.profiles p where p.id = auth.uid();
$function$;

create or replace function public.is_active_employee()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('employee', 'foreman', 'subcontractor_1')
      and is_paused = false
  );
$function$;

revoke all on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated;

-- A manager may enter a day for a foreman (body of 0116, role list widened).
create or replace function public.create_job_for_employee(
  p_employee_id uuid,
  p_submission_key uuid,
  p_job_date date,
  p_ot text,
  p_depart time,
  p_arrivee time,
  p_fin time,
  p_km_aller numeric,
  p_note text,
  p_depart_fold smallint default null,
  p_fin_fold smallint default null
)
returns table (id uuid, broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  target public.profiles%rowtype;
  existing public.jobs%rowtype;
  new_job public.jobs%rowtype;
  new_broadcast uuid;
  today_local date := (timezone('America/Toronto', now()))::date;
  clean_ot text := btrim(coalesce(p_ot, ''));
  clean_note text := btrim(coalesce(p_note, ''));
  duration_minutes integer;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if p_employee_id is null or p_submission_key is null or p_job_date is null then
    raise exception using errcode = '23514', message = 'manager_entry_missing_field';
  end if;
  if clean_ot = '' then
    raise exception using errcode = '23514', message = 'manager_entry_ot_required';
  end if;
  if char_length(clean_note) < 3 or char_length(clean_note) > 500 then
    raise exception using errcode = '23514', message = 'manager_entry_note_required';
  end if;
  if p_job_date > today_local or p_job_date < today_local - 31 then
    raise exception using errcode = '23514', message = 'manager_entry_date_out_of_window';
  end if;
  if p_depart is null or p_fin is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := (extract(epoch from (p_fin - p_depart))::integer / 60);
  if duration_minutes <= 0 then duration_minutes := duration_minutes + 1440; end if;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  if (p_depart_fold is not null and p_depart_fold not in (1, 2))
     or (p_fin_fold is not null and p_fin_fold not in (1, 2)) then
    raise exception using errcode = '23514', message = 'invalid_dst_choice';
  end if;
  if p_km_aller is not null and p_km_aller < 0 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;

  select * into target from public.profiles p where p.id = p_employee_id;
  if target.id is null
     or target.role not in ('employee', 'foreman', 'admin', 'subcontractor_1')
     or target.is_paused then
    raise exception using errcode = 'P0002', message = 'manager_entry_employee_not_eligible';
  end if;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));

  -- A retry (lost response, double click) resolves to the committed row: one job, one
  -- audit event, one notification.
  select * into existing from public.jobs j
   where j.user_id = p_employee_id and j.submission_key = p_submission_key;
  if existing.id is not null then
    if existing.manager_entry_at is null then
      raise exception using errcode = '23505', message = 'submission_key_conflict';
    end if;
    return query select existing.id, null::uuid;
    return;
  end if;

  actor_name := public.audit_actor_name(actor_id);

  insert into public.jobs (
    user_id, submission_key, job_date, ot, depart, arrivee, fin, depart_fold, fin_fold,
    km_total, km_aller, return_time_minutes, km_retour,
    status, locked,
    manager_entry_at, manager_entry_by, manager_entry_by_name, manager_entry_note
  ) values (
    p_employee_id, p_submission_key, p_job_date, clean_ot, p_depart, p_arrivee, p_fin, p_depart_fold, p_fin_fold,
    coalesce(p_km_aller, 0), coalesce(p_km_aller, 0), 0, 0,
    'saved', false,
    now(), actor_id, actor_name, clean_note
  )
  returning * into new_job;

  -- The employee must be able to submit a past-dated job even after the daily entry
  -- deadline (enforce_job_entry_window): open that day for 14 days. A null (no expiry)
  -- unlock is never shortened.
  insert into public.job_entry_unlocks (user_id, job_date, unlocked_until, reason, created_by)
  values (p_employee_id, p_job_date, now() + interval '14 days', 'manager_entry', actor_id)
  on conflict (user_id, job_date) do update
    set unlocked_until = case
      when public.job_entry_unlocks.unlocked_until is null then null
      else greatest(public.job_entry_unlocks.unlocked_until, excluded.unlocked_until)
    end;

  insert into public.manager_broadcasts (sender_id, body, audience)
  values (
    actor_id,
    'Une feuille de temps a été créée pour vous (' || to_char(p_job_date, 'YYYY-MM-DD')
      || '). Ouvrez Historique, vérifiez-la puis validez-la pour la soumettre.'
      || E'\n\n'
      || 'A timesheet was created for you (' || to_char(p_job_date, 'YYYY-MM-DD')
      || '). Open History, review it, then confirm it to submit.',
    'selected'
  )
  returning manager_broadcasts.id into new_broadcast;
  insert into public.broadcast_recipients (broadcast_id, employee_id)
  values (new_broadcast, p_employee_id);

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_created_by_owner', p_employee_id, target.full_name, new_job.id,
          jsonb_build_object('job_date', p_job_date, 'ot', clean_ot, 'depart', p_depart,
                             'arrivee', p_arrivee, 'fin', p_fin, 'km', coalesce(p_km_aller, 0),
                             'note', clean_note, 'depart_fold', new_job.depart_fold, 'fin_fold', new_job.fin_fold));

  return query select new_job.id, new_broadcast;
end;
$function$;


revoke all on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint)
  from public, anon;
grant execute on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint)
  to authenticated;

-- The drop-down of work orders gets the « CONTREMAÎTRE » choice (managers can hide or move it).
insert into public.preset_work_orders (label, sort_order)
select 'CONTREMAÎTRE', coalesce(max(sort_order), 0) + 1 from public.preset_work_orders
on conflict do nothing;
