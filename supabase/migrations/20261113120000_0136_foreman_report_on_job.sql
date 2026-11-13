-- 0136: the foreman note follows the work sheet (V2.4.253).
--
-- A foreman's note (0134) is now attached to the job (fiche de travail) it was written on: foreman_reports.job_id.
-- It is optional (a foreman may still write none), one note per job, and it follows the job:
--   * deleting the job deletes its note (on delete cascade);
--   * returning the job for correction leaves the note, and the foreman can edit it while the job is editable
--     (status saved / updated), like the job itself;
--   * a manager can delete a note on its own (Notes › Contremaître), and exports the notes as a CSV.
-- Reports written before this migration have no job (job_id null) and stay as they are.

alter table public.foreman_reports
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

create unique index if not exists foreman_reports_job_uniq on public.foreman_reports (job_id) where job_id is not null;

-- On update only the text can change: the author, the job, the date, the key and the time stay.
create or replace function public.foreman_reports_guard_update()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.job_id := old.job_id;
  new.submission_key := old.submission_key;
  new.report_date := old.report_date;
  new.created_at := old.created_at;
  new.body := btrim(new.body);
  new.audited_name := nullif(btrim(coalesce(new.audited_name, '')), '');
  return new;
end;
$$;

drop trigger if exists foreman_reports_guard_update on public.foreman_reports;
create trigger foreman_reports_guard_update before update on public.foreman_reports
  for each row execute function public.foreman_reports_guard_update();

drop policy if exists "foreman_reports: foreman inserts own" on public.foreman_reports;
drop policy if exists "foreman_reports: foreman edits own while job editable" on public.foreman_reports;
drop policy if exists "foreman_reports: manager deletes" on public.foreman_reports;

-- Only an active foreman writes, only as himself, and a linked job must be his own.
create policy "foreman_reports: foreman inserts own" on public.foreman_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'foreman' and not coalesce(p.is_paused, false))
    and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()))
  );

-- The author edits the text of a note attached to one of his jobs while that job is still editable.
create policy "foreman_reports: foreman edits own while job editable" on public.foreman_reports
  for update to authenticated
  using (
    user_id = auth.uid()
    and job_id is not null
    and exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid() and j.status in ('saved', 'updated'))
  )
  with check (user_id = auth.uid());

create policy "foreman_reports: manager deletes" on public.foreman_reports
  for delete to authenticated
  using (public.get_my_role() = 'manager');

-- Same rule as 0134: Supabase's default grants are removed, then only what is used is granted.
revoke all on public.foreman_reports from anon, public, authenticated;
grant select, insert, delete on public.foreman_reports to authenticated;
grant update (body, audited_name) on public.foreman_reports to authenticated;
revoke all on function public.foreman_reports_guard_update() from public, anon, authenticated;
