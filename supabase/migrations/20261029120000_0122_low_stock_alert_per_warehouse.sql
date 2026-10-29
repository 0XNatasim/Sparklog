-- 0122: choose which warehouses raise the low-stock alert (V2.4.199).
--
-- The minimums of 0121 can be entered for every warehouse, but only some of them must alert the managers
-- (the owner's choice, 2026-10-29: Saguenay, Charlevoix and Rimouski at first). The choice is a flag on the
-- warehouse (employee group), off by default: nothing alerts until a manager turns it on in
-- Inventaire › Minimums. inventory_stock_levels() returns it (alert_enabled); the screen and the badge only
-- count a low stock where it is on.

alter table public.employee_groups
  add column if not exists low_stock_alert boolean not null default false;

-- One row per ratio: the minimum, what the warehouse holds, whether it is below, and whether this warehouse
-- raises the alert (employee_groups.low_stock_alert). A warehouse below its minimum without the alert is still
-- shown on the Minimums screen, but it does not count on the page banner or the menu badge.
--   headcount     employees of the group who are not paused
--   lists_counted members with an inventory list in the last 7 days (the stock only counts these lists)
--   is_low        only when at least one list was counted (no list at all = unknown, not an alert)
drop function if exists public.inventory_stock_levels();
create function public.inventory_stock_levels()
returns table(
  group_id uuid, group_name text, code text, item_name text, per_employee numeric,
  headcount integer, minimum numeric, on_hand numeric, lists_counted integer, is_low boolean, alert_enabled boolean
)
language sql stable security definer set search_path to 'public' as $function$
  with members as (
    select m.group_id, p.id as user_id
      from public.employee_group_members m
      join public.profiles p on p.id = m.user_id
     where public.get_my_role() = 'manager' and not p.is_paused
  ),
  latest as (
    select i.user_id, max(i.job_date) as job_date
      from public.inventory_items i
     where i.section = 'inventory'
       and i.job_date >= current_date - 7
       and i.user_id in (select user_id from members)
     group by i.user_id
  ),
  -- One row per employee and code: a quantity that was read wins over one cut at the edge of a capture,
  -- then the latest slot (same rule as the Inventaire page).
  merged as (
    select distinct on (i.user_id, i.code) i.user_id, i.code, i.quantity
      from public.inventory_items i
      join latest l on l.user_id = i.user_id and l.job_date = i.job_date
     where i.section = 'inventory'
     order by i.user_id, i.code, (i.quantity is not null) desc, i.slot desc
  ),
  heads as (select m.group_id, count(*)::integer as headcount from members m group by m.group_id),
  lists as (
    select m.group_id, count(*)::integer as n from members m join latest l on l.user_id = m.user_id group by m.group_id
  ),
  held as (
    select m.group_id, x.code, sum(coalesce(x.quantity, 0)) as on_hand
      from members m join merged x on x.user_id = m.user_id
     group by m.group_id, x.code
  )
  select r.group_id, g.name, r.code, r.name, r.per_employee,
         coalesce(h.headcount, 0),
         round(r.per_employee * coalesce(h.headcount, 0), 2),
         coalesce(d.on_hand, 0),
         coalesce(l.n, 0),
         coalesce(l.n, 0) > 0 and coalesce(d.on_hand, 0) < r.per_employee * coalesce(h.headcount, 0),
         g.low_stock_alert
    from public.inventory_min_ratios r
    join public.employee_groups g on g.id = r.group_id
    left join heads h on h.group_id = r.group_id
    left join lists l on l.group_id = r.group_id
    left join held d on d.group_id = r.group_id and d.code = r.code
   where public.get_my_role() = 'manager'
   order by g.name, r.name, r.code;
$function$;

revoke all on function public.inventory_stock_levels() from public, anon;
grant execute on function public.inventory_stock_levels() to authenticated;
