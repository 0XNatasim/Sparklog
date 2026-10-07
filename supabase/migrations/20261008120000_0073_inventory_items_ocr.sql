-- 0073: written inventory list read from the end-of-shift screenshots.
-- Each screenshot is read by the process_inventory_screenshot Edge Function (OCR); the equipment
-- rows (code, name, quantity) it finds are stored per employee, day and screenshot slot so
-- managers see a list first and the photos second. The raw OCR text is never stored.

alter table public.inventory_screenshots
  add column if not exists ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processed', 'needs_review', 'failed')),
  add column if not exists list_total integer check (list_total is null or list_total between 0 and 1000);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  slot smallint not null check (slot between 1 and 3),
  code text not null check (code ~ '^EQ[0-9]{6}$'),
  name text not null,
  quantity numeric(10, 2) not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, job_date, slot, code)
);
create index if not exists inventory_items_date_user_idx on public.inventory_items (job_date, user_id);
create index if not exists inventory_items_expires_at_idx on public.inventory_items (expires_at);

alter table public.inventory_items enable row level security;

-- Rows are written only by the Edge Function (service role bypasses RLS); nobody can edit them.
drop policy if exists "inventory items: owner read" on public.inventory_items;
create policy "inventory items: owner read" on public.inventory_items
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "inventory items: manager read" on public.inventory_items;
create policy "inventory items: manager read" on public.inventory_items
  for select to authenticated using ((select public.get_my_role()) = 'manager');
