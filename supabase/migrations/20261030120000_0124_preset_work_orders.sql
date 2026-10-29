-- 0124: pre-made work orders (OT) — V2.4.206.
--
-- Some entries are not Field Service jobs but come back every day: a safety break, a training, « OK Karine »…
-- Employees were typing them by hand, each in their own way (« OK KARINE », « OK-KARINE », « OKKARINE »,
-- « PAUSE SST », « PAUSE SANTÉ SÉCURITÉ »…). The managers keep a short list here; the time entry offers it in a
-- drop-down and the chosen label is written to jobs.ot as plain text, exactly like a typed OT, so nothing else
-- changes: the OT reuse check (0108) only looks at numbers of 4 digits or more, which is why a label may not look
-- like one. Everybody signed in reads the list (the labels are not sensitive); only managers (manager-level
-- session, two-factor — 0103) add, rename, hide or remove one. A job keeps its own text if a label is later removed.

create table if not exists public.preset_work_orders (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint preset_work_orders_label_chk check (char_length(btrim(label)) between 2 and 60 and btrim(label) !~ '^[0-9]{4,}$')
);

-- One label per name, whatever the case or the spaces around it.
create unique index if not exists preset_work_orders_label_uniq on public.preset_work_orders (lower(btrim(label)));

alter table public.preset_work_orders enable row level security;

drop policy if exists "preset_work_orders: signed-in read" on public.preset_work_orders;
drop policy if exists "preset_work_orders: managers insert" on public.preset_work_orders;
drop policy if exists "preset_work_orders: managers update" on public.preset_work_orders;
drop policy if exists "preset_work_orders: managers delete" on public.preset_work_orders;

create policy "preset_work_orders: signed-in read" on public.preset_work_orders
  for select to authenticated using (true);
create policy "preset_work_orders: managers insert" on public.preset_work_orders
  for insert to authenticated with check (public.get_my_role() = 'manager');
create policy "preset_work_orders: managers update" on public.preset_work_orders
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');
create policy "preset_work_orders: managers delete" on public.preset_work_orders
  for delete to authenticated using (public.get_my_role() = 'manager');

revoke all on public.preset_work_orders from anon, public, authenticated;
grant select on public.preset_work_orders to authenticated;
grant insert, update, delete on public.preset_work_orders to authenticated;

insert into public.preset_work_orders (label, sort_order) values
  ('PAUSE SÉCURITÉ', 10),
  ('FORMATION HILO EMBAUCHE', 20),
  ('FORMATION BRITTON', 30),
  ('FORMATION HQ', 40),
  ('OK KARINE', 50)
on conflict do nothing;
