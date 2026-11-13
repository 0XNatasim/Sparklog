-- 0140: a manager returns a foreman's work sheet with a reason, and the other managers see it (V2.4.255).
--
-- Notes › Contremaître « Retourner la fiche »: the manager may give a reason (optional, 500 characters). It is kept on the
-- note (returned_at, returned_by, returned_by_name, return_reason), so every other manager sees that the sheet was
-- returned, by whom and why, and the foreman sees the reason on his sheet. The sheet goes back to the foreman exactly as
-- return_job_for_correction does it (submitted + locked → updated + unlocked, same stale-state check, same audit action,
-- the reason added to the audit details). Only this function writes the returned_* columns (the foreman's update grant
-- stays body / audited_name).

alter table public.foreman_reports
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references auth.users(id) on delete set null,
  add column if not exists returned_by_name text,
  add column if not exists return_reason text;

alter table public.foreman_reports drop constraint if exists foreman_reports_return_reason_chk;
alter table public.foreman_reports add constraint foreman_reports_return_reason_chk
  check (return_reason is null or char_length(btrim(return_reason)) between 1 and 500);

-- 0138 guard, but the edit time only moves when the text changes (returning a sheet must not turn the note « unread » again).
create or replace function public.foreman_reports_guard_update()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.job_id := old.job_id;
  new.submission_key := old.submission_key;
  new.report_date := old.report_date;
  new.created_at := old.created_at;
  new.body := btrim(new.body);
  new.audited_name := nullif(btrim(coalesce(new.audited_name, '')), '');
  if new.body is distinct from old.body or new.audited_name is distinct from old.audited_name then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.foreman_reports_guard_update() from public, anon, authenticated;

create or replace function public.return_foreman_note_sheet(
  p_report_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text default null
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  note public.foreman_reports%rowtype;
  current_job public.jobs%rowtype;
  changed_job public.jobs%rowtype;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;
  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception using errcode = '23514', message = 'return_reason_too_long';
  end if;

  select * into note from public.foreman_reports r where r.id = p_report_id;
  if note.id is null or note.job_id is null then
    raise exception using errcode = 'P0002', message = 'note_has_no_sheet';
  end if;

  select * into current_job from public.jobs j where j.id = note.job_id for update;
  if current_job.id is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if p_expected_updated_at is null
     or current_job.status <> 'submitted' or not current_job.locked
     or current_job.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'job_state_changed';
  end if;

  actor_name := public.audit_actor_name(actor_id);

  update public.jobs j
     set status = 'updated', locked = false
   where j.id = current_job.id
   returning * into changed_job;

  update public.foreman_reports r
     set returned_at = now(), returned_by = actor_id, returned_by_name = actor_name, return_reason = clean_reason
   where r.id = note.id;

  insert into public.audit_log
    (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values
    (actor_id, actor_name, 'job_returned_for_correction',
     changed_job.user_id, public.audit_actor_name(changed_job.user_id), changed_job.id,
     jsonb_build_object('from', current_job.status, 'to', changed_job.status,
                        'job_date', changed_job.job_date, 'ot', changed_job.ot,
                        'foreman_note', note.id, 'reason', clean_reason));

  return query select changed_job.id, changed_job.status;
end;
$function$;

revoke all on function public.return_foreman_note_sheet(uuid, timestamptz, text) from public, anon;
grant execute on function public.return_foreman_note_sheet(uuid, timestamptz, text) to authenticated;
