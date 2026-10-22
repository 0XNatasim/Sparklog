-- 0110: new hires and their first day of work (V2.4.168).
--
-- A manager can mark an account « Nouvel(le) employé(e) » with the date of the first day of work. Between
-- the hiring (sign-up) and that date the person does not work yet: Équipe en direct, the week view,
-- « Pas soumis hier » and the missing-entry count leave them out until the date (src/lib/live-crew.js).
-- The account itself is unchanged: it can be activated before the first day so the person can log in and
-- fill in their profile. In Employés the person is « En attente » (not active, not inactive) until then, and
-- leaves the new sign-up badge (pending_signups): if the account is still not activated on the first day,
-- the badge counts them again. Only managers write the column (the employee whitelist trigger 0018 refuses any
-- other column from an employee), and every change goes to the Journal.

alter table public.profiles
  add column if not exists start_date date;

-- Journal: role / pause / former-employee entries (0109), plus the first day of work.
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
  return new;
end;
$function$;

-- New sign-ups to activate (0109), minus new hires whose first day of work is still to come.
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
     and (p.start_date is null or p.start_date <= (now() at time zone 'America/Toronto')::date)
   order by u.created_at desc
   limit 500;
$$;

revoke all on function public.pending_signups() from public, anon;
grant execute on function public.pending_signups() to authenticated;
