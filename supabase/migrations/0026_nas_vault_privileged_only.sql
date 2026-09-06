-- Move NAS/SIN out of profiles into a restricted vault readable only by privileged
-- users (owner + dev) and the service role. Masks it from all other managers.

create or replace function public.is_privileged()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select auth.uid() in (
    '38034202-cd04-4666-b7d0-3c24ae906afd'::uuid,  -- Karine (owner)
    '5f834c60-532d-4c17-b77e-df257c5b66b3'::uuid   -- Simon (dev)
  );
$fn$;
revoke all on function public.is_privileged() from public, anon;
grant execute on function public.is_privileged() to authenticated;

create table if not exists public.employee_sensitive (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nas text check (nas is null or nas ~ '^[0-9]{9}$'),
  updated_at timestamptz not null default now()
);
alter table public.employee_sensitive enable row level security;
drop policy if exists "sensitive: privileged read"   on public.employee_sensitive;
drop policy if exists "sensitive: privileged insert" on public.employee_sensitive;
drop policy if exists "sensitive: privileged update" on public.employee_sensitive;
create policy "sensitive: privileged read"   on public.employee_sensitive for select to authenticated using (public.is_privileged());
create policy "sensitive: privileged insert" on public.employee_sensitive for insert to authenticated with check (public.is_privileged());
create policy "sensitive: privileged update" on public.employee_sensitive for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

insert into public.employee_sensitive (user_id, nas)
  select id, nas_employee from public.profiles where nas_employee is not null
  on conflict (user_id) do update set nas = excluded.nas;

-- Remove the dead pre-0018 guard (its trigger was already dropped) that still names the
-- column, then drop the column so it can no longer be read via the broad profiles select.
drop function if exists public.protect_profile_privileged_fields();
alter table public.profiles drop column if exists nas_employee;

-- Audited reveal: returns a worker's NAS only to a privileged user and logs the access.
create or replace function public.reveal_nas(target uuid)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare v text; tname text;
begin
  if not public.is_privileged() then raise exception 'Not authorized to view sensitive data'; end if;
  select nas into v from public.employee_sensitive where user_id = target;
  select full_name into tname from public.profiles where id = target;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name)
    values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'nas_reveal', target, tname);
  return v;
end;
$fn$;
revoke all on function public.reveal_nas(uuid) from public, anon;
grant execute on function public.reveal_nas(uuid) to authenticated;
