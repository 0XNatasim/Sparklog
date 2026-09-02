-- Audit log of sensitive manager actions: role changes, account pause/unpause,
-- job unlocks, job approvals, meal/parking reviews, and user deletions.
--
-- Rows are written by SECURITY DEFINER triggers (and, for deletions, by the
-- delete_user edge function using the service role). actor_id / target_user_id
-- are plain uuids with a snapshotted name — NOT foreign keys — so an entry
-- survives even after the user it refers to is deleted.

create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  actor_id       uuid,
  actor_name     text,
  action         text not null,
  target_user_id uuid,
  target_name    text,
  job_id         uuid,
  details        jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Managers can read the log; nobody writes through the API (writes come from
-- SECURITY DEFINER triggers / the service role, which bypass RLS).
drop policy if exists "audit_log: managers read" on public.audit_log;
create policy "audit_log: managers read" on public.audit_log
  for select using (public.get_my_role() = 'manager');

revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Helper to resolve the acting user's display name.
create or replace function public.audit_actor_name(uid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select full_name from public.profiles where id = uid;
$$;

-- Profile role / pause changes.
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'role_change', new.id, new.full_name,
            jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.is_paused is distinct from old.is_paused then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'pause_change', new.id, new.full_name,
            jsonb_build_object('is_paused', coalesce(new.is_paused, false)));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_profile_change on public.profiles;
create trigger audit_profile_change after update on public.profiles
  for each row execute function public.audit_profile_change();

-- Job entry unlocks (also covers manager-enabled overtime edits).
create or replace function public.audit_job_unlock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare actor uuid := coalesce(new.created_by, auth.uid());
begin
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
  values (actor, public.audit_actor_name(actor), 'job_unlock', new.user_id, public.audit_actor_name(new.user_id),
          jsonb_build_object('job_date', new.job_date, 'unlocked_until', new.unlocked_until, 'reason', new.reason));
  return new;
end;
$$;
drop trigger if exists audit_job_unlock on public.job_entry_unlocks;
create trigger audit_job_unlock after insert on public.job_entry_unlocks
  for each row execute function public.audit_job_unlock();

-- Job approvals.
create or replace function public.audit_job_status()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status is distinct from old.status and new.status = 'approved' then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'job_approved', new.user_id, public.audit_actor_name(new.user_id),
            new.id, jsonb_build_object('job_date', new.job_date, 'ot', new.ot));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_job_status on public.jobs;
create trigger audit_job_status after update on public.jobs
  for each row execute function public.audit_job_status();

-- Meal claim reviews.
create or replace function public.audit_meal_review()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare actor uuid := coalesce(new.reviewed_by, auth.uid());
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
    values (actor, public.audit_actor_name(actor), 'meal_reviewed', new.user_id, public.audit_actor_name(new.user_id),
            new.job_id, jsonb_build_object('status', new.status, 'job_date', new.job_date));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_meal_review on public.meal_claims;
create trigger audit_meal_review after update on public.meal_claims
  for each row execute function public.audit_meal_review();

-- Parking receipt reviews.
create or replace function public.audit_parking_review()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare actor uuid := coalesce(new.reviewed_by, auth.uid());
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
    values (actor, public.audit_actor_name(actor), 'parking_reviewed', new.user_id, public.audit_actor_name(new.user_id),
            new.job_id, jsonb_build_object('status', new.status, 'job_date', new.job_date));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_parking_review on public.parking_receipts;
create trigger audit_parking_review after update on public.parking_receipts
  for each row execute function public.audit_parking_review();
