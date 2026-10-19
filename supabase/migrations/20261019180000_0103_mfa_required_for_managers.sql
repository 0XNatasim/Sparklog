-- 0103: two-factor authentication (TOTP) required for manager-tier accounts (V2.4.157).
--
-- Owner, manager and admin accounts must sign in with a password AND a 6-digit code from an
-- authenticator app. Supabase Auth then issues a JWT whose `aal` claim is 'aal2'. Every manager-level
-- permission in the database already goes through public.get_my_role() (all RLS policies and RPCs) or
-- public.is_privileged() (NAS), so the rule is enforced in those two functions: without 'aal2', a
-- manager-tier account is treated as an employee (own rows only) and is not privileged. A stolen
-- password alone therefore opens no manager data, whatever client is used. Employees and
-- subcontractors are unchanged (no code asked).
--
-- The app asks for the code (or the first enrolment) right after the password; the Edge Functions
-- check the same claim (_shared/mfa.ts). Recovery when a phone is lost: a second device can be added
-- in Profil; otherwise the developer deletes the account's factors in Supabase (auth.mfa_factors).

-- Roles that must use two-factor authentication. Kept in step with MFA_REQUIRED_ROLES (src/lib/mfa.js).
create or replace function public.mfa_required_role(p_role text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(p_role in ('owner', 'manager', 'admin'), false);
$$;

-- True when the caller's session passed the second factor.
create or replace function public.session_is_aal2()
returns boolean language sql stable set search_path to '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- Same mapping as before (owner → manager, admin with granted sections → manager, admin /
-- subcontractor → employee), but manager-level access needs an aal2 session.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
           when p.role in ('owner', 'manager')
             or (p.role = 'admin' and coalesce(array_length(p.admin_sections, 1), 0) > 0)
             then case when public.session_is_aal2() then 'manager' else 'employee' end
           when p.role in ('admin', 'subcontractor_1') then 'employee'
           else p.role
         end
    from public.profiles p where p.id = auth.uid();
$function$;

create or replace function public.is_privileged()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.session_is_aal2() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$function$;

-- Employees screen: who has a verified second factor (ids only). Manager level, hence aal2.
create or replace function public.mfa_enrolled_users()
returns table(user_id uuid)
language sql stable security definer set search_path to '' as $function$
  select distinct f.user_id from auth.mfa_factors f
   where f.status = 'verified' and public.get_my_role() = 'manager';
$function$;

-- set_travel_pay_rule (0101) checked the role directly: it now also needs an aal2 session.
create or replace function public.set_travel_pay_rule(
  p_rule_key text,
  p_user_ids uuid[],
  p_choice text,
  p_billed_to_britton boolean,
  p_threshold_km numeric,
  p_effective_from date
) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  ids uuid[];
  written integer;
  names text;
begin
  if actor_id is null or not public.session_is_aal2() or not exists (
    select 1 from public.profiles where id = actor_id and role in ('manager', 'owner') and not coalesce(is_paused, false)
  ) then
    raise exception 'travel_rule_not_allowed' using errcode = '42501';
  end if;
  if p_effective_from is null then
    raise exception 'travel_rule_effective_date_required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct u), '{}') into ids from unnest(coalesce(p_user_ids, '{}')) as u where u is not null;
  if cardinality(ids) = 0 or cardinality(ids) > 500 then
    raise exception 'travel_rule_no_employee' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(ids) as u where not exists (select 1 from public.profiles p where p.id = u)) then
    raise exception 'travel_rule_unknown_employee' using errcode = '22023';
  end if;

  -- The check constraint validates the line / choice pair.
  insert into public.travel_pay_rules (user_id, rule_key, effective_from, choice, billed_to_britton, threshold_km, updated_at, updated_by)
  select u, p_rule_key, p_effective_from, p_choice, p_billed_to_britton, p_threshold_km, now(), actor_id
    from unnest(ids) as u
  on conflict (user_id, rule_key, effective_from) do update
     set choice = excluded.choice,
         billed_to_britton = excluded.billed_to_britton,
         threshold_km = excluded.threshold_km,
         updated_at = now(),
         updated_by = actor_id;
  get diagnostics written = row_count;

  select string_agg(coalesce(p.full_name, p.email, p.id::text), ', ' order by p.full_name)
    into names from public.profiles p where p.id = any(ids);

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'travel_rule_set',
          case when cardinality(ids) = 1 then ids[1] end,
          case when cardinality(ids) <= 3 then names else cardinality(ids)::text || ' employés' end,
          null,
          jsonb_build_object('rule_key', p_rule_key, 'choice', p_choice, 'billed_to_britton', p_billed_to_britton,
                             'threshold_km', p_threshold_km, 'effective_from', p_effective_from,
                             'employees', cardinality(ids), 'user_ids', to_jsonb(ids)));
  return written;
end;
$$;

revoke all on function public.mfa_required_role(text) from public, anon;
revoke all on function public.session_is_aal2() from public, anon;
revoke all on function public.mfa_enrolled_users() from public, anon;
revoke all on function public.set_travel_pay_rule(text, uuid[], text, boolean, numeric, date) from public, anon;
grant execute on function public.mfa_required_role(text) to authenticated;
grant execute on function public.session_is_aal2() to authenticated;
grant execute on function public.mfa_enrolled_users() to authenticated;
grant execute on function public.set_travel_pay_rule(text, uuid[], text, boolean, numeric, date) to authenticated;
