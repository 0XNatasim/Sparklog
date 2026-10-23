-- 0114: employee groups (V2.4.175), Gestion V3 › Équipe › Groupes.
--
-- A manager names a group (often a warehouse: « Entrepôt Laval ») and ticks its employees. A person can be
-- in several groups. Groups are used to pick the recipients of a Communications message in one click and to
-- total the inventory of a warehouse (Gestion › Inventaire). They change nothing else: no right, no pay.
-- Everything requires a manager-level session (get_my_role() = 'manager': owner, manager, admin with granted
-- sections — aal2 / two-factor since 0103). Employees never read them.

create table if not exists public.employee_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_groups_name_chk check (char_length(btrim(name)) between 1 and 60),
  constraint employee_groups_note_chk check (note is null or char_length(note) <= 300)
);

-- One name per group, whatever the case or the spaces around it.
create unique index if not exists employee_groups_name_uniq on public.employee_groups (lower(btrim(name)));

create table if not exists public.employee_group_members (
  group_id uuid not null references public.employee_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists employee_group_members_user_idx on public.employee_group_members (user_id);

drop trigger if exists employee_groups_updated_at on public.employee_groups;
create trigger employee_groups_updated_at before update on public.employee_groups
  for each row execute function public.set_updated_at();

alter table public.employee_groups enable row level security;
alter table public.employee_group_members enable row level security;

drop policy if exists "employee_groups: managers" on public.employee_groups;
create policy "employee_groups: managers" on public.employee_groups
  for all to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');

drop policy if exists "employee_group_members: managers" on public.employee_group_members;
create policy "employee_group_members: managers" on public.employee_group_members
  for all to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');

revoke all on public.employee_groups from anon, public;
revoke all on public.employee_group_members from anon, public;
grant select, insert, update, delete on public.employee_groups to authenticated;
grant select, insert, delete on public.employee_group_members to authenticated;
