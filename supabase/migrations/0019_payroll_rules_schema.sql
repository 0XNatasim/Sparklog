-- M1.1 rules schema. A container for CCQ / compensation rules that hold ONLY once a
-- qualified specialist approves them with a cited source. Stores no invented rules.
create extension if not exists btree_gist;

create table public.payroll_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code       text not null,
  title           text not null,
  sector          text,
  trade           text,
  appendix        text,
  schedule_type   text,
  effective_from  date not null,
  effective_to    date,
  source_document text,
  source_section  text,
  examples        jsonb not null default '[]'::jsonb,
  exceptions      jsonb not null default '[]'::jsonb,
  version         integer not null default 1,
  status          text not null default 'draft'
                    check (status in ('draft','approved','superseded')),
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint payroll_rules_version_unique unique (rule_code, version),
  constraint payroll_rules_dates_ordered
    check (effective_to is null or effective_to >= effective_from),
  -- Governance gate in the database: a rule is 'approved' iff it records who approved
  -- it and when. Approval metadata cannot exist without approved status, and approved
  -- status cannot exist without the metadata.
  constraint payroll_rules_approval_integrity
    check ((status = 'approved') = (approved_by is not null and approved_at is not null)),
  -- No two APPROVED rules for the same (code, sector, trade, appendix, schedule)
  -- may cover overlapping effective-date ranges. Drafts/superseded are unconstrained.
  constraint payroll_rules_no_overlap
    exclude using gist (
      rule_code with =,
      (coalesce(sector,''))        with =,
      (coalesce(trade,''))         with =,
      (coalesce(appendix,''))      with =,
      (coalesce(schedule_type,'')) with =,
      daterange(effective_from, effective_to) with &&
    ) where (status = 'approved')
);

comment on table public.payroll_rules is
  'CCQ/compensation rules. A rule is authoritative only when status=approved with a cited source and specialist approver. See docs/adr/0001 and GPT.md M1.';

alter table public.payroll_rules enable row level security;
create policy "payroll_rules: manager manage" on public.payroll_rules
  for all to authenticated
  using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');
create policy "payroll_rules: read approved" on public.payroll_rules
  for select to authenticated
  using (status = 'approved');
