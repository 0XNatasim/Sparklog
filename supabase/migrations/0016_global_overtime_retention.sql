-- One global evidence-retention value shared by every employee.
create table if not exists public.overtime_settings (
  id boolean primary key default true check (id = true),
  evidence_retention_days integer not null default 30 check (evidence_retention_days between 1 and 365),
  updated_at timestamptz not null default now()
);

insert into public.overtime_settings (id, evidence_retention_days)
select true, coalesce(max(evidence_retention_days), 30) from public.profiles
on conflict (id) do nothing;

alter table public.overtime_settings enable row level security;

drop policy if exists "overtime settings: authenticated read" on public.overtime_settings;
create policy "overtime settings: authenticated read"
  on public.overtime_settings for select to authenticated using (true);

drop policy if exists "overtime settings: manager update" on public.overtime_settings;
create policy "overtime settings: manager update"
  on public.overtime_settings for update to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');
