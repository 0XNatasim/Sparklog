-- Manager broadcast notifications: a manager posts a message to all or to
-- selected employees; each targeted employee must acknowledge ("OK") it, and
-- the manager can see who has and has not viewed it.
create table if not exists public.manager_broadcasts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'selected')),
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  broadcast_id uuid not null references public.manager_broadcasts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz,
  primary key (broadcast_id, employee_id)
);

create index if not exists broadcast_recipients_unacked_idx
  on public.broadcast_recipients (employee_id) where acknowledged_at is null;

alter table public.manager_broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists "broadcasts: manager manage" on public.manager_broadcasts;
create policy "broadcasts: manager manage" on public.manager_broadcasts
  for all to authenticated
  using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "broadcasts: recipient read" on public.manager_broadcasts;
create policy "broadcasts: recipient read" on public.manager_broadcasts
  for select to authenticated
  using (exists (select 1 from public.broadcast_recipients r where r.broadcast_id = id and r.employee_id = auth.uid()));

drop policy if exists "broadcast recipients: manager manage" on public.broadcast_recipients;
create policy "broadcast recipients: manager manage" on public.broadcast_recipients
  for all to authenticated
  using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "broadcast recipients: employee read own" on public.broadcast_recipients;
create policy "broadcast recipients: employee read own" on public.broadcast_recipients
  for select to authenticated
  using (employee_id = auth.uid());

drop policy if exists "broadcast recipients: employee ack own" on public.broadcast_recipients;
create policy "broadcast recipients: employee ack own" on public.broadcast_recipients
  for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());
