-- 0136: the foreman note follows the work sheet (V2.4.253).
--
-- A foreman's note (0134) is now attached to the job (fiche de travail) it was written on: foreman_reports.job_id.
-- It is optional (a foreman may still write none), one note per job, and it follows the job:
--   * deleting the job deletes its note (on delete cascade);
--   * returning the job for correction leaves the note, and the foreman can edit it while the job is editable
--     (status saved / updated), like the job itself;
--   * a manager can delete a note on its own (Notes › Contremaître), and exports the notes as a CSV.
-- Reports written before this migration are attached to their sheet when it can be found (see the backfill below).

alter table public.foreman_reports
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

create unique index if not exists foreman_reports_job_uniq on public.foreman_reports (job_id) where job_id is not null;

-- Notes written before this migration follow the work sheet too: each one is attached to the same foreman's
-- CONTREMAÎTRE sheet of the day, when that day has exactly one such sheet (otherwise it stays without a sheet).
-- A sheet has one note: when a foreman wrote several notes for the same sheet, the later ones are appended to the
-- first (oldest first, blank line between) and removed, unless the result would exceed 5000 characters (then only the
-- first is attached and the others stay as they are). Done before the update guard below, which freezes job_id.
do $$
declare
  r record;
  ids uuid[];
  merged text;
begin
  for r in
    with one_job as (
      select j.user_id, j.job_date, (array_agg(j.id))[1] as job_id
        from public.jobs j
       where upper(btrim(j.ot)) = 'CONTREMAÎTRE'
       group by j.user_id, j.job_date
      having count(*) = 1
    )
    select o.job_id,
           array_agg(n.id order by n.created_at, n.id) as note_ids,
           string_agg(btrim(n.body), E'\n\n' order by n.created_at, n.id) as merged_body
      from public.foreman_reports n
      join one_job o on o.user_id = n.user_id and o.job_date = n.report_date
     where n.job_id is null
     group by o.job_id
  loop
    ids := r.note_ids;
    merged := r.merged_body;
    if char_length(merged) <= 5000 then
      update public.foreman_reports
         set job_id = r.job_id,
             body = merged,
             audited_name = coalesce(audited_name, (select n2.audited_name from public.foreman_reports n2
                                                      where n2.id = any (ids) and n2.audited_name is not null
                                                      order by n2.created_at, n2.id limit 1))
       where id = ids[1];
      if array_length(ids, 1) > 1 then
        delete from public.foreman_reports where id = any (ids[2:array_length(ids, 1)]);
      end if;
    else
      update public.foreman_reports set job_id = r.job_id where id = ids[1];
    end if;
  end loop;
end $$;

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
