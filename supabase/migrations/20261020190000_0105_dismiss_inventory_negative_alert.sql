-- 0105: name the negative-inventory alert and let a manager dismiss it (V2.4.158).
--
-- 0104 raised a badge from inventory_negative_alerts(), but the client only summed the
-- count, and the dismiss call targeted a function that was never created. The quantities
-- stay in inventory_items. Dismissing records that this employee-day was seen, so the
-- notice drops for every manager. A later inventory day with a new negative shows again.
-- The same window as 0104: each employee's latest inventory day in the last 7 days.

create table if not exists public.inventory_alert_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  dismissed_by uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, job_date)
);

alter table public.inventory_alert_dismissals enable row level security;
revoke all on public.inventory_alert_dismissals from public, anon, authenticated;

-- Return type changes (one row per negative item, with the employee's name), so drop first.
drop function if exists public.inventory_negative_alerts();

create or replace function public.inventory_negative_alerts()
returns table (
  user_id uuid,
  full_name text,
  job_date date,
  code text,
  item_name text,
  quantity numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with latest as (
    select i.user_id, max(i.job_date) as job_date
      from public.inventory_items i
     where public.get_my_role() = 'manager'
       and i.section = 'inventory'
       and i.job_date >= current_date - 7
     group by i.user_id
  )
  select distinct on (l.user_id, l.job_date, i.code)
         l.user_id,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), l.user_id::text) as full_name,
         l.job_date,
         i.code,
         i.name as item_name,
         i.quantity
    from latest l
    join public.inventory_items i
      on i.user_id = l.user_id
     and i.job_date = l.job_date
    left join public.profiles p on p.id = l.user_id
   where i.section = 'inventory'
     and i.quantity < 0
     and not exists (
       select 1
         from public.inventory_alert_dismissals d
        where d.user_id = l.user_id
          and d.job_date = l.job_date
     )
   order by l.user_id, l.job_date, i.code, i.slot desc;
$function$;

create or replace function public.dismiss_inventory_negative_alert(p_user_id uuid, p_job_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  target text;
  inserted uuid;
begin
  if actor is null or not public.session_is_aal2() or not exists (
    select 1 from public.profiles
     where id = actor and role in ('manager', 'owner') and not coalesce(is_paused, false)
  ) then
    raise exception 'inventory_alert_not_allowed' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_date is null then
    raise exception 'inventory_alert_missing' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.inventory_items
     where user_id = p_user_id
       and job_date = p_job_date
       and section = 'inventory'
       and quantity < 0
  ) then
    raise exception 'inventory_alert_none' using errcode = 'P0002';
  end if;

  insert into public.inventory_alert_dismissals (user_id, job_date, dismissed_by)
  values (p_user_id, p_job_date, actor)
  on conflict (user_id, job_date) do nothing
  returning user_id into inserted;

  if inserted is null then
    return;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), id::text)
    into target
    from public.profiles
   where id = p_user_id;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (
    actor,
    public.audit_actor_name(actor),
    'inventory_negative_dismissed',
    p_user_id,
    target,
    null,
    jsonb_build_object('job_date', p_job_date)
  );
end;
$function$;

revoke all on function public.inventory_negative_alerts() from public, anon;
grant execute on function public.inventory_negative_alerts() to authenticated;

revoke all on function public.dismiss_inventory_negative_alert(uuid, date) from public, anon;
grant execute on function public.dismiss_inventory_negative_alert(uuid, date) to authenticated;
