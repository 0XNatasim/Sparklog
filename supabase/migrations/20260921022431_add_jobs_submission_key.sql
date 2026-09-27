-- Applied to production as add_jobs_submission_key (2026-09-21). C-3 idempotency key; NULLs
-- are distinct, so legacy rows without a key stay valid.
alter table public.jobs add column if not exists submission_key uuid;

comment on column public.jobs.submission_key is
  'Client idempotency key for job submission; unique per (user_id, submission_key). NULL for legacy/pre-key rows (NULLs distinct so many allowed).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_user_submission_key_uniq') then
    alter table public.jobs
      add constraint jobs_user_submission_key_uniq unique (user_id, submission_key);
  end if;
end $$;
