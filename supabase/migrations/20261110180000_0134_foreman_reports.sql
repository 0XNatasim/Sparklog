-- 0134: foreman reports (V2.4.243).
--
-- A foreman (role 'foreman', 0133) audits the other employees. When the work order of his time entry is
-- « CONTREMAÎTRE », the entry screen offers « Notes du contremaître »: a short report (optional name of the
-- audited person, free text). The managers read the reports in Notes › Contremaître.
--   foreman : inserts his own reports and reads his own; never edits or deletes them (a report is a record).
--   manager : every manager-level account (get_my_role() = 'manager', so aal2 / two-factor — 0103) reads all.
-- The audited person is typed text, not a link: an employee cannot read the other profiles (RLS), so the
-- foreman never sees a list of names. submission_key makes a retry (lost response, double tap) one report.

create table if not exists public.foreman_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  submission_key uuid not null,
  report_date date not null,
  audited_name text,
  body text not null,
  created_at timestamptz not null default now(),
  constraint foreman_reports_body_chk check (char_length(btrim(body)) between 1 and 5000),
  constraint foreman_reports_name_chk check (audited_name is null or char_length(btrim(audited_name)) between 1 and 120),
  constraint foreman_reports_user_key_uniq unique (user_id, submission_key)
);

create index if not exists foreman_reports_created_idx on public.foreman_reports (created_at desc);
create index if not exists foreman_reports_user_created_idx on public.foreman_reports (user_id, created_at desc);

-- The time of a report is the server's.
create or replace function public.foreman_reports_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.created_at := now();
  new.body := btrim(new.body);
  new.audited_name := nullif(btrim(coalesce(new.audited_name, '')), '');
  return new;
end;
$$;

drop trigger if exists foreman_reports_guard on public.foreman_reports;
create trigger foreman_reports_guard before insert on public.foreman_reports
  for each row execute function public.foreman_reports_guard();

alter table public.foreman_reports enable row level security;

drop policy if exists "foreman_reports: read own or manager" on public.foreman_reports;
drop policy if exists "foreman_reports: foreman inserts own" on public.foreman_reports;

create policy "foreman_reports: read own or manager" on public.foreman_reports
  for select to authenticated
  using (user_id = auth.uid() or public.get_my_role() = 'manager');

-- Only an active foreman writes, and only as himself.
create policy "foreman_reports: foreman inserts own" on public.foreman_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'foreman' and not coalesce(p.is_paused, false))
  );

revoke all on public.foreman_reports from anon, public;
grant select, insert on public.foreman_reports to authenticated;
revoke all on function public.foreman_reports_guard() from public, anon, authenticated;
