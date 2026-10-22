-- 0109: new sign-ups to activate, and former employees (V2.4.167).
--
-- A self sign-up is created inactive (is_paused, handle_new_user). Managers now see how many are waiting
-- (badge on Employés in the side menu): accounts never activated (first_activated_at is null), inactive,
-- whose email is confirmed and that are not former employees. Someone paused after working stays out of
-- the count. A former employee is an inactive account marked « mis à pied » (laid off) or « ne travaille
-- plus » (left), with an optional note: they leave the waiting count and keep their history. Activating
-- the account again clears the mark. Only managers write these columns (the employee whitelist trigger
-- 0018 refuses any other column from an employee), and every change goes to the Journal.

alter table public.profiles
  add column if not exists departure_status text,
  add column if not exists departure_note text,
  add column if not exists first_activated_at timestamptz;

-- Everyone already active, and anyone inactive who has entered time, has been activated before.
update public.profiles p
   set first_activated_at = now()
 where p.first_activated_at is null
   and (not p.is_paused or exists (select 1 from public.jobs j where j.user_id = p.id));

alter table public.profiles drop constraint if exists profiles_departure_status_chk;
alter table public.profiles add constraint profiles_departure_status_chk
  check (departure_status is null or departure_status in ('mise_a_pied', 'depart'));
alter table public.profiles drop constraint if exists profiles_departure_note_chk;
alter table public.profiles add constraint profiles_departure_note_chk
  check (departure_note is null or char_length(departure_note) <= 500);

-- Re-activating an account (rehire) clears the former-employee mark and records the first activation;
-- marking someone as a former employee also makes the account inactive.
create or replace function public.sync_departure_status()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.departure_status is not null and (tg_op = 'INSERT' or new.departure_status is distinct from old.departure_status) then
    new.is_paused := true;
  elsif tg_op = 'UPDATE' and old.is_paused and not coalesce(new.is_paused, false) then
    new.departure_status := null;
  end if;
  if not coalesce(new.is_paused, false) and new.first_activated_at is null then
    new.first_activated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_departure_status on public.profiles;
create trigger profiles_sync_departure_status
  before insert or update on public.profiles
  for each row execute function public.sync_departure_status();

-- Journal: the existing role / pause entries, plus former-employee marks.
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
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
  if new.departure_status is distinct from old.departure_status
     or (new.departure_status is not null and new.departure_note is distinct from old.departure_note) then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'departure_change', new.id, new.full_name,
            jsonb_build_object('from', old.departure_status, 'to', new.departure_status, 'note', new.departure_note));
  end if;
  return new;
end;
$function$;

-- The five former employees imported with the Dynacom cumulative (no real account) left the company.
update public.profiles p
   set departure_status = 'depart'
  from auth.users u
 where u.id = p.id and p.is_paused and p.departure_status is null
   and u.email like '%@messier-connexion.invalid';

-- Accounts waiting for activation (manager level, aal2 via get_my_role): never activated, inactive, not a
-- former employee, not the owner. email_confirmed tells whether the person validated their email (the side-menu badge
-- counts only those).
create or replace function public.pending_signups()
returns table (user_id uuid, full_name text, email text, created_at timestamptz, email_confirmed boolean)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.full_name, p.email, u.created_at, u.email_confirmed_at is not null
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.get_my_role() = 'manager'
     and p.is_paused
     and p.first_activated_at is null
     and p.departure_status is null
     and p.role <> 'owner'
   order by u.created_at desc
   limit 500;
$$;

revoke all on function public.pending_signups() from public, anon;
grant execute on function public.pending_signups() to authenticated;
revoke all on function public.sync_departure_status() from public, anon, authenticated;
