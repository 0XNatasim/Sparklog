-- 0121: minimum stock per warehouse, as a ratio per employee (V2.4.198).
--
-- A warehouse is an employee group (0114, « Entrepôt Laval »). For each warehouse and each equipment code
-- (« EQ000123 », the codes of the inventory screenshots, 0073) a manager sets a ratio: how many of that
-- device the warehouse must hold PER EMPLOYEE. The minimum is ratio x the number of employees of the group
-- (members who are not paused). inventory_stock_levels() compares it to what the group holds now: the sum of
-- its members' latest inventory list of the last 7 days (the same reading as the « Entrepôt » total of the
-- Inventaire page). A warehouse below its minimum raises an alert (page banner + badge on « Inventaire »).
-- Everything requires a manager-level session (get_my_role() = 'manager', two-factor — 0103).

create table if not exists public.inventory_min_ratios (
  group_id uuid not null references public.employee_groups(id) on delete cascade,
  code text not null check (code ~ '^EQ[0-9]{6}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  per_employee numeric(8, 3) not null check (per_employee > 0 and per_employee <= 1000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (group_id, code)
);

-- The stamp is the server's, whatever the browser sends.
create or replace function public.inventory_min_ratios_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inventory_min_ratios_guard on public.inventory_min_ratios;
create trigger inventory_min_ratios_guard before insert or update on public.inventory_min_ratios
  for each row execute function public.inventory_min_ratios_guard();
revoke all on function public.inventory_min_ratios_guard() from public, anon, authenticated;

alter table public.inventory_min_ratios enable row level security;

drop policy if exists "inventory_min_ratios: managers" on public.inventory_min_ratios;
create policy "inventory_min_ratios: managers" on public.inventory_min_ratios
  for all to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');

revoke all on public.inventory_min_ratios from anon, public, authenticated;
grant select, insert, update, delete on public.inventory_min_ratios to authenticated;

-- One row per ratio: the minimum, what the warehouse holds, and whether it is below.
--   headcount     employees of the group who are not paused
--   lists_counted members with an inventory list in the last 7 days (the stock only counts these lists)
--   is_low        only when at least one list was counted (no list at all = unknown, not an alert)
create or replace function public.inventory_stock_levels()
returns table(
  group_id uuid, group_name text, code text, item_name text, per_employee numeric,
  headcount integer, minimum numeric, on_hand numeric, lists_counted integer, is_low boolean
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
         coalesce(l.n, 0) > 0 and coalesce(d.on_hand, 0) < r.per_employee * coalesce(h.headcount, 0)
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
