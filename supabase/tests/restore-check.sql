-- Restore check (V2.4.227) — READ ONLY. Run it in the SQL editor of the restored project, then compare
-- with the same file run on production. It changes nothing and returns counts only (no name, NAS or amount).
-- Every row has a `check` name and `ok` true/false; a restore is accepted when every `ok` is true.

with expected_tables(t) as (values
  ('profiles'),('jobs'),('overtime_evidence'),('parking_receipts'),('meal_claims'),
  ('payroll_period_ledger'),('payroll_rates'),('statutory_rate_sets'),('employee_sensitive'),
  ('employee_tax_profiles'),('audit_log'),('company_holidays'),('travel_pay_rules')
),
missing_tables as (
  select t from expected_tables where to_regclass('public.' || t) is null
),
no_rls as (
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),
nas_rows as (
  select count(*) as n from public.employee_sensitive where nas_secret_id is not null
),
vault_rows as (
  select count(*) as n from vault.secrets s
  where s.id in (select nas_secret_id from public.employee_sensitive where nas_secret_id is not null)
)
select 'tables_present' as check, (select count(*) from missing_tables) = 0 as ok,
       coalesce((select string_agg(t, ',') from missing_tables), 'all present') as detail
union all
select 'rls_on_every_public_table', (select count(*) from no_rls) = 0,
       coalesce((select string_agg(relname, ',') from no_rls), 'all enabled')
union all
select 'nas_secrets_still_in_vault', (select n from nas_rows) = (select n from vault_rows),
       (select n from nas_rows)::text || ' NAS rows / ' || (select n from vault_rows)::text || ' vault secrets'
union all
select 'scheduled_jobs_present',
       (select count(*) from cron.job where jobname in ('ccq-daily-sync','cleanup-evidence-daily','ccq-card-renewals')) = 3,
       (select count(*) from cron.job)::text || ' cron jobs'
union all
select 'storage_buckets_present',
       (select count(*) from storage.buckets where id in ('overtime-evidence','parking-receipts','accident-files')) = 3,
       (select count(*) from storage.buckets)::text || ' buckets'
union all
select 'latest_migration_is_current',
       (select max(version) from supabase_migrations.schema_migrations) >= '20261101200000',
       (select max(version) from supabase_migrations.schema_migrations)
union all
select 'key_row_counts', true,
       'profiles=' || (select count(*) from public.profiles)
       || ' jobs=' || (select count(*) from public.jobs)
       || ' ledger=' || (select count(*) from public.payroll_period_ledger)
       || ' audit=' || (select count(*) from public.audit_log)
order by 1;
