-- Forms managers can make visible on every employee's Profile page.
create table if not exists public.employee_forms (
  form_id text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.employee_forms (form_id, enabled) values
  ('overtime', false),
  ('absence', false),
  ('audit', false),
  ('equipment-transfer', false),
  ('britton-inventory', false),
  ('equipment-pickup', false),
  ('subcontractor-inventory', false)
on conflict (form_id) do nothing;

alter table public.employee_forms enable row level security;

create policy "employee_forms: authenticated read"
  on public.employee_forms for select
  to authenticated
  using (true);

create policy "employee_forms: manager update"
  on public.employee_forms for update
  to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');
