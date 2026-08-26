create table if not exists public.employee_form_access (
  form_id text not null references public.employee_forms(form_id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (form_id, employee_id)
);

alter table public.employee_form_access enable row level security;

drop policy if exists "employee form access: employee read own" on public.employee_form_access;
create policy "employee form access: employee read own"
  on public.employee_form_access for select to authenticated
  using (employee_id = auth.uid());

drop policy if exists "employee form access: manager read" on public.employee_form_access;
create policy "employee form access: manager read"
  on public.employee_form_access for select to authenticated
  using (public.get_my_role() = 'manager');

drop policy if exists "employee form access: manager insert" on public.employee_form_access;
create policy "employee form access: manager insert"
  on public.employee_form_access for insert to authenticated
  with check (public.get_my_role() = 'manager');

drop policy if exists "employee form access: manager delete" on public.employee_form_access;
create policy "employee form access: manager delete"
  on public.employee_form_access for delete to authenticated
  using (public.get_my_role() = 'manager');
