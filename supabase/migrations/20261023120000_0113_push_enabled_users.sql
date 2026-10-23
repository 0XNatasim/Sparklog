-- 0113: Employees screen — who has phone notifications on (at least one registered device).
-- Notifications are on by default since V2.4.173 (the app subscribes each device once the browser allows
-- it); this tells the managers who still has to tap « Activer ». Ids only, manager level (aal2 through
-- get_my_role(), 0103). push_subscriptions keeps its own-rows-only policies.
create or replace function public.push_enabled_users()
returns table(user_id uuid)
language sql stable security definer set search_path to '' as $function$
  select distinct s.user_id from public.push_subscriptions s
   where public.get_my_role() = 'manager';
$function$;

revoke all on function public.push_enabled_users() from public, anon;
grant execute on function public.push_enabled_users() to authenticated;
