-- Employee activity log (Gestion → Audit → Employés).
--
-- Records, per user, when they:
--   * sign in with their password ('login') or open the app with a saved session
--     ('app_open', at most once per 30 minutes) — written by the app through the
--     log_employee_activity RPC;
--   * save, submit or delete one of their own jobs ('job_saved', 'job_submitted',
--     'job_deleted') — written by an AFTER trigger on jobs, only when the acting
--     user is the job's owner (manager, service-role and export writes are skipped).
--
-- The trigger swallows its own errors: the log must never block a job write.
-- Managers read it (same rule as audit_log); nobody writes through the API.

create table if not exists public.employee_activity_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null,
  user_name   text,
  event       text not null check (event in ('login', 'app_open', 'job_saved', 'job_submitted', 'job_deleted')),
  job_id      uuid,
  details     jsonb not null default '{}'::jsonb
);

create index if not exists employee_activity_log_created_idx
  on public.employee_activity_log (created_at desc);
create index if not exists employee_activity_log_user_created_idx
  on public.employee_activity_log (user_id, created_at desc);

alter table public.employee_activity_log enable row level security;

drop policy if exists "employee_activity_log: managers read" on public.employee_activity_log;
create policy "employee_activity_log: managers read" on public.employee_activity_log
  for select using ((select public.get_my_role()) = 'manager');

revoke insert, update, delete on public.employee_activity_log from anon, authenticated;

-- Sign-in / app-open events, called by the signed-in user's app.
create or replace function public.log_employee_activity(p_event text, p_device text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  window_size interval;
begin
  if uid is null or p_event not in ('login', 'app_open') then
    return;
  end if;
  -- De-duplicate: a sign-in within a minute, or an app visit within 30 minutes of
  -- the previous sign-in/visit, is the same presence.
  window_size := case when p_event = 'login' then interval '1 minute' else interval '30 minutes' end;
  if exists (
    select 1 from public.employee_activity_log
     where user_id = uid
       and event = any (case when p_event = 'login' then array['login'] else array['login', 'app_open'] end)
       and created_at > now() - window_size
  ) then
    return;
  end if;
  insert into public.employee_activity_log (user_id, user_name, event, details)
  values (uid, public.audit_actor_name(uid), p_event,
          case when nullif(btrim(p_device), '') is null then '{}'::jsonb
               else jsonb_build_object('device', left(btrim(p_device), 40)) end);
end;
$$;

revoke all on function public.log_employee_activity(text, text) from public, anon;
grant execute on function public.log_employee_activity(text, text) to authenticated;

-- Job save / submit / delete events by the job's owner.
create or replace function public.log_employee_job_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  ev  text;
  j   public.jobs;
begin
  begin
    if uid is null then
      return null;
    end if;

    if tg_op = 'DELETE' then
      j := old;
      if j.user_id is distinct from uid then return null; end if;
      ev := 'job_deleted';
    elsif tg_op = 'INSERT' then
      j := new;
      if j.user_id is distinct from uid then return null; end if;
      ev := case when j.status = 'submitted' then 'job_submitted' else 'job_saved' end;
    else
      j := new;
      if j.user_id is distinct from uid then return null; end if;
      if new.status is distinct from old.status and new.status = 'submitted' then
        ev := 'job_submitted';
      elsif (new.job_date, new.ot, new.depart, new.arrivee, new.fin, new.km_aller, new.km_retour, new.return_time_minutes)
            is distinct from
            (old.job_date, old.ot, old.depart, old.arrivee, old.fin, old.km_aller, old.km_retour, old.return_time_minutes) then
        ev := 'job_saved';
      else
        return null;
      end if;
    end if;

    insert into public.employee_activity_log (user_id, user_name, event, job_id, details)
    values (uid, public.audit_actor_name(uid), ev, j.id,
            jsonb_build_object(
              'job_date', j.job_date,
              'ot', j.ot,
              'depart', left(j.depart::text, 5),
              'fin', left(j.fin::text, 5),
              'status', j.status,
              'edit', tg_op = 'UPDATE'));
  exception when others then
    -- The activity log is informational: never let it block a job write.
    null;
  end;
  return null;
end;
$$;

drop trigger if exists jobs_log_employee_activity on public.jobs;
create trigger jobs_log_employee_activity
  after insert or update or delete on public.jobs
  for each row execute function public.log_employee_job_activity();
