-- 0104: negative inventory quantities (V2.4.158).
--
-- Field Service can show a negative stock on the truck ("-1,00": more installed than the list held).
-- The reading put the minus in the name ("Gradateur mural intelligent Jasco -") and kept 1,00, and the
-- table refused anything below 0 anyway. Now the reading keeps the sign (parse.ts), the table accepts
-- it, and managers get an alert (badge on « Inventaire »); nothing changes for the employee.

-- 1. Allow negative quantities (still bounded to avoid extreme outliers)
alter table public.inventory_items drop constraint if exists inventory_items_quantity_check;
alter table public.inventory_items
  add constraint inventory_items_quantity_check check (quantity between -99999 and 99999);

-- 2. Fix existing rows where the minus sign got stuck in the `name` field
--    (only affects rows where name ends with a dash-like character and quantity > 0)
update public.inventory_items
   set name = btrim(regexp_replace(name, '\s*[-–−]\s*$', '')),
       quantity = -quantity
 where name ~ '\s[-–−]\s*$' and quantity > 0;

-- 3. Create/refresh the alert function used by managers
create or replace function public.inventory_negative_alerts()
returns table(user_id uuid, job_date date, negative_count integer)
language sql stable security definer set search_path to 'public' as $function$
  with latest as (
    select i.user_id, max(i.job_date) as job_date
      from public.inventory_items i
     where public.get_my_role() = 'manager'
       and i.section = 'inventory'
       and i.job_date >= current_date - 7
     group by i.user_id
  )
  select l.user_id, l.job_date, count(distinct i.code)::integer
    from latest l
    join public.inventory_items i on i.user_id = l.user_id and i.job_date = l.job_date
   where i.section = 'inventory' and i.quantity < 0
   group by l.user_id, l.job_date;
$function$;

-- 4. Secure the alert function (only authenticated users may execute it)
revoke all on function public.inventory_negative_alerts() from public, anon;
grant execute on function public.inventory_negative_alerts() to authenticated;

-- 5. Performance index for the alert function
--    Speeds up the frequent check for negative quantities in the last 7 days.
create index if not exists
  inventory_items_neg_alert_idx
  on public.inventory_items (user_id, job_date, section)
  where quantity < 0 and section = 'inventory';