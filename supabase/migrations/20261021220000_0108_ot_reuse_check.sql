-- 0108: « OT déjà utilisé » anomaly for managers (V2.4.165).
--
-- Nothing stops two jobs from carrying the same Field Service OT number, and some reuses are legitimate
-- (a return visit, another technician finishing the job). So nothing is blocked: the manager screens
-- (À traiter, Feuilles de temps) ask, for the submitted jobs they show, which OTHER jobs carry the same
-- OT number, any employee, any date, any status, and flag them before approval.
-- Only real OT numbers count (4 digits or more, spaces trimmed): free text such as
-- « FORMATION SECOURISME » or « OK KARINE » repeats normally and is ignored.

create or replace function public.normalized_ot(p_ot text)
returns text language sql immutable set search_path to '' as $$
  select case when btrim(coalesce(p_ot, '')) ~ '^[0-9]{4,}$' then btrim(p_ot) end;
$$;

create index if not exists jobs_normalized_ot_idx
  on public.jobs (public.normalized_ot(ot))
  where public.normalized_ot(ot) is not null;

-- For each given job with an OT number, every other job with the same number. Manager level (aal2 via
-- get_my_role); anyone else gets no rows. At most 1000 job ids per call (the screens send ≤ 600).
create or replace function public.ot_reuse_for_jobs(p_job_ids uuid[])
returns table (
  job_id uuid,
  other_job_id uuid,
  other_user_id uuid,
  other_name text,
  other_date date,
  other_depart time,
  other_fin time,
  other_status text
)
language sql stable security definer set search_path to 'public' as $$
  select j.id, o.id, o.user_id, coalesce(p.full_name, p.email), o.job_date, o.depart, o.fin, o.status
    from public.jobs j
    join public.jobs o
      on public.normalized_ot(o.ot) = public.normalized_ot(j.ot)
     and o.id <> j.id
    left join public.profiles p on p.id = o.user_id
   where public.get_my_role() = 'manager'
     and j.id = any ((coalesce(p_job_ids, '{}'::uuid[]))[1:1000])
     and public.normalized_ot(j.ot) is not null
   order by j.id, o.job_date, o.depart;
$$;

-- normalized_ot stays executable by everyone: the index evaluates it on every write to jobs, including
-- writes by the service role (approval batch, cleanup), which a revoke would break. It reads nothing.
revoke all on function public.ot_reuse_for_jobs(uuid[]) from public, anon;
grant execute on function public.ot_reuse_for_jobs(uuid[]) to authenticated;
