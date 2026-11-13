-- 0138: read / unread state of the foreman notes, per manager (V2.4.254).
--
-- The note icon on a work sheet is red for a manager who has not opened that note yet and blue once he has; each manager
-- has his own state (one reading it does not turn it blue for the others). A note edited afterwards (foreman_reports.updated_at)
-- is unread again. The foreman always sees his own note, blue, whatever the managers did.
--   foreman_report_reads: one row per (note, manager); a manager reads and writes only his own rows.

alter table public.foreman_reports
  add column if not exists updated_at timestamptz not null default now();
update public.foreman_reports set updated_at = created_at;

-- 0136 guard, plus the edit time.
create or replace function public.foreman_reports_guard_update()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.job_id := old.job_id;
  new.submission_key := old.submission_key;
  new.report_date := old.report_date;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.body := btrim(new.body);
  new.audited_name := nullif(btrim(coalesce(new.audited_name, '')), '');
  return new;
end;
$$;
revoke all on function public.foreman_reports_guard_update() from public, anon, authenticated;

create table if not exists public.foreman_report_reads (
  report_id uuid not null references public.foreman_reports(id) on delete cascade,
  manager_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (report_id, manager_id)
);

-- The time of a reading is the server's, and the reader is the caller.
create or replace function public.foreman_report_reads_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.manager_id := coalesce(auth.uid(), new.manager_id);
  new.read_at := now();
  return new;
end;
$$;
revoke all on function public.foreman_report_reads_guard() from public, anon, authenticated;

drop trigger if exists foreman_report_reads_guard on public.foreman_report_reads;
create trigger foreman_report_reads_guard before insert or update on public.foreman_report_reads
  for each row execute function public.foreman_report_reads_guard();

alter table public.foreman_report_reads enable row level security;

drop policy if exists "foreman_report_reads: own select" on public.foreman_report_reads;
drop policy if exists "foreman_report_reads: own insert" on public.foreman_report_reads;
drop policy if exists "foreman_report_reads: own update" on public.foreman_report_reads;

create policy "foreman_report_reads: own select" on public.foreman_report_reads
  for select to authenticated
  using (manager_id = auth.uid() and public.get_my_role() = 'manager');
create policy "foreman_report_reads: own insert" on public.foreman_report_reads
  for insert to authenticated
  with check (manager_id = auth.uid() and public.get_my_role() = 'manager');
create policy "foreman_report_reads: own update" on public.foreman_report_reads
  for update to authenticated
  using (manager_id = auth.uid() and public.get_my_role() = 'manager')
  with check (manager_id = auth.uid() and public.get_my_role() = 'manager');

-- Same rule as 0134: Supabase's default grants are removed, then only what is used is granted.
revoke all on public.foreman_report_reads from anon, public, authenticated;
grant select, insert on public.foreman_report_reads to authenticated;
grant update (read_at) on public.foreman_report_reads to authenticated;
