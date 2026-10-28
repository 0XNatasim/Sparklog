-- 0120: registre d'accidents (V2.4.197).
--
-- A register kept by the managers only (owner / manager, manager-level session — two-factor, 0103): an accident,
-- a near miss, property damage or a vehicle incident, who was involved, what happened, the care given, the days
-- lost, the CNESST claim number and the corrective actions. Employees do not see it and cannot write to it.
-- Nothing is ever deleted: a file is closed (and can be reopened), never removed. Each creation and each change
-- of status is written to audit_log. The register holds health information: never copy a row into the repository.

create table if not exists public.accident_log (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  occurred_time time,
  -- The person involved: an employee of the app, or (employee_id null) someone else (visitor, client, other firm).
  employee_id uuid references public.profiles(id) on delete set null,
  person_name text not null,
  kind text not null default 'injury' check (kind in ('injury', 'near_miss', 'property', 'vehicle')),
  severity text not null default 'first_aid' check (severity in ('first_aid', 'medical', 'lost_time', 'critical')),
  location text,
  description text not null,
  witnesses text,
  treatment text,
  lost_days integer check (lost_days is null or lost_days between 0 and 1000),
  cnesst_claim text,
  corrective_actions text,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accident_log_person_chk check (char_length(btrim(person_name)) between 1 and 120),
  constraint accident_log_description_chk check (char_length(btrim(description)) between 3 and 4000),
  constraint accident_log_text_len_chk check (
    coalesce(char_length(location), 0) <= 300
    and coalesce(char_length(witnesses), 0) <= 1000
    and coalesce(char_length(treatment), 0) <= 1000
    and coalesce(char_length(cnesst_claim), 0) <= 60
    and coalesce(char_length(corrective_actions), 0) <= 2000
  )
);

create index if not exists accident_log_date_idx on public.accident_log (occurred_on desc, created_at desc);
create index if not exists accident_log_open_idx on public.accident_log (occurred_on desc) where status = 'open';
create index if not exists accident_log_employee_idx on public.accident_log (employee_id) where employee_id is not null;

-- Server-owned fields: author, creation time, update time and the closing stamp cannot be forged by the browser.
create or replace function public.accident_log_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.closed_at := case when new.status = 'closed' then now() end;
    new.closed_by := case when new.status = 'closed' then auth.uid() end;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.status = 'closed' and old.status <> 'closed' then
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif new.status = 'open' then
      new.closed_at := null;
      new.closed_by := null;
    else
      new.closed_at := old.closed_at;
      new.closed_by := old.closed_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists accident_log_guard on public.accident_log;
create trigger accident_log_guard before insert or update on public.accident_log
  for each row execute function public.accident_log_guard();

-- One audit line when a file is opened, and one when its status changes (closed / reopened).
create or replace function public.accident_log_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'accident_logged', new.employee_id, new.person_name,
            jsonb_build_object('occurred_on', new.occurred_on, 'kind', new.kind, 'severity', new.severity, 'accident_id', new.id));
  elsif new.status is distinct from old.status then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'accident_status', new.employee_id, new.person_name,
            jsonb_build_object('occurred_on', new.occurred_on, 'from', old.status, 'to', new.status, 'accident_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists accident_log_audit on public.accident_log;
create trigger accident_log_audit after insert or update on public.accident_log
  for each row execute function public.accident_log_audit();

revoke all on function public.accident_log_guard() from public, anon, authenticated;
revoke all on function public.accident_log_audit() from public, anon, authenticated;

alter table public.accident_log enable row level security;

drop policy if exists "accident_log: managers read" on public.accident_log;
drop policy if exists "accident_log: managers insert" on public.accident_log;
drop policy if exists "accident_log: managers update" on public.accident_log;

create policy "accident_log: managers read" on public.accident_log
  for select to authenticated using (public.get_my_role() = 'manager');
create policy "accident_log: managers insert" on public.accident_log
  for insert to authenticated with check (public.get_my_role() = 'manager');
create policy "accident_log: managers update" on public.accident_log
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

-- No delete grant, no policy: a register entry is closed, never removed.
revoke all on public.accident_log from anon, public, authenticated;
grant select, insert, update on public.accident_log to authenticated;
