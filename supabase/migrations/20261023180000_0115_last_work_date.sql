-- 0115: date d'embauche et dernier jour travaillé (V2.4.176), fiche Employés.
--
-- The hiring date is the existing start_date (0110): the first day of work. A date still to come keeps the
-- person « En attente » (new hire), a past date is just the hiring date. The last day worked is new:
-- last_work_date, for a layoff or a departure (Relevé d'emploi, block 11). It can never be before the hiring
-- date. Only managers write it (the employee whitelist trigger 0018 refuses any other column from an
-- employee) and every change goes to the Journal, like start_date.

alter table public.profiles
  add column if not exists last_work_date date;

alter table public.profiles drop constraint if exists profiles_last_work_after_start_chk;
alter table public.profiles add constraint profiles_last_work_after_start_chk
  check (last_work_date is null or start_date is null or last_work_date >= start_date);

-- Journal: role / pause / former-employee / first day (0110), plus the last day worked.
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
  if new.start_date is distinct from old.start_date then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'start_date_change', new.id, new.full_name,
            jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;
  if new.last_work_date is distinct from old.last_work_date then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'last_work_date_change', new.id, new.full_name,
            jsonb_build_object('from', old.last_work_date, 'to', new.last_work_date));
  end if;
  return new;
end;
$function$;
