-- 0090: how each new timesheet entry was filled — 'screenshot' (Field Service screenshot read by
-- the auto-fill) or 'manual' (typed by hand). Managers see a red star on manual entries.
--
-- A side table rather than a jobs column: the jobs table carries many write triggers (entry
-- window, rate snapshot, overtime evidence, audit, updated_at…) and the atomic save_own_job RPC
-- stays unchanged. The employee app writes one row right after saving a NEW entry; a missing row
-- (older jobs, owner emergency entries, a failed write) simply shows no star. Informational only:
-- it is not a security control.

create table if not exists public.job_entry_sources (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('screenshot', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.job_entry_sources enable row level security;

revoke all on public.job_entry_sources from anon, authenticated;
grant select, insert on public.job_entry_sources to authenticated;

-- Whoever can read the job (its employee, managers) can read how it was entered.
drop policy if exists "job_entry_sources: read with the job" on public.job_entry_sources;
create policy "job_entry_sources: read with the job" on public.job_entry_sources
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_entry_sources.job_id));

-- The employee records it once, for their own job. No update or delete policy: set once.
drop policy if exists "job_entry_sources: employee insert own" on public.job_entry_sources;
create policy "job_entry_sources: employee insert own" on public.job_entry_sources
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.jobs j where j.id = job_entry_sources.job_id and j.user_id = (select auth.uid()))
  );
