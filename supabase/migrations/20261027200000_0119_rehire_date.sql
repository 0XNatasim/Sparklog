-- 0119: date de réembauche (V2.4.193), fiche Employés › Identité.
--
-- A person who left (layoff, departure) and came back keeps the first hiring date (start_date, 0110) and gets a
-- rehire date: the first day worked of the CURRENT period of employment. The Relevé d'emploi starts there (block 10
-- « Premier jour travaillé », and the weekly pay periods of block 15 stop at it), since the earlier period was
-- already on a previous ROE. Never before the hiring date. The last day worked (0115) may be before it (the earlier
-- departure); the ROE then ignores it. Only managers write it (the employee whitelist trigger 0018 refuses any
-- other column from an employee) and every change goes to the Journal.

alter table public.profiles
  add column if not exists rehire_date date;

alter table public.profiles drop constraint if exists profiles_rehire_after_start_chk;
alter table public.profiles add constraint profiles_rehire_after_start_chk
  check (rehire_date is null or start_date is null or rehire_date >= start_date);

-- Journal: the entries of 0115, plus the rehire date.
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
  if new.rehire_date is distinct from old.rehire_date then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
    values (auth.uid(), public.audit_actor_name(auth.uid()), 'rehire_date_change', new.id, new.full_name,
            jsonb_build_object('from', old.rehire_date, 'to', new.rehire_date));
  end if;
  return new;
end;
$function$;
