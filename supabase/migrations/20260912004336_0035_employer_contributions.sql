-- 0035: editable employer-contribution rates for the Costing tab.
--
-- Per-hour employer charges by CCQ level (Compagnon / Apprenti 4-1), used by the Costing
-- tab to show the full employer cost on top of actual wages. Seeded from the ACQ grid
-- that was previously hard-coded in Testing.jsx (source: acq.org grilles taux horaires),
-- so a manager can update the figures yearly without a code change. These feed a labeled
-- ESTIMATE — not finalized payroll.
--
-- Deliberately excludes wage (row 1) and vacation/holiday indemnity (row 2 = the 13%
-- congés the Costing tab already computes), and the truck/tools/profit lines, so nothing
-- is double-counted.

create table if not exists public.employer_contributions (
  id uuid primary key default gen_random_uuid(),
  code            text not null unique,
  label           text not null,
  sort_order      int not null default 0,
  rate_compagnon  numeric not null default 0,
  rate_apprenti_4 numeric not null default 0,
  rate_apprenti_3 numeric not null default 0,
  rate_apprenti_2 numeric not null default 0,
  rate_apprenti_1 numeric not null default 0,
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);

alter table public.employer_contributions enable row level security;

-- Cost configuration is manager-tier only (get_my_role collapses admin/owner to manager).
drop policy if exists "employer_contributions: manager read" on public.employer_contributions;
create policy "employer_contributions: manager read" on public.employer_contributions
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "employer_contributions: manager write" on public.employer_contributions;
create policy "employer_contributions: manager write" on public.employer_contributions
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop trigger if exists employer_contributions_set_updated_at on public.employer_contributions;
create trigger employer_contributions_set_updated_at
  before update on public.employer_contributions
  for each row execute function public.set_updated_at();

-- Seed from the ACQ grid (per hour, in dollars): [compagnon, apprenti4, apprenti3, apprenti2, apprenti1]
insert into public.employer_contributions
  (code, label, sort_order, rate_compagnon, rate_apprenti_4, rate_apprenti_3, rate_apprenti_2, rate_apprenti_1) values
  ('ei',          'Assurance emploi (EI)',        1, 1.04, 0.52, 0.63, 0.73, 0.89),
  ('rqap',        'RQAP',                         2, 0.35, 0.17, 0.21, 0.24, 0.29),
  ('rrq',         'RRQ (QPP)',                    3, 3.71, 1.91, 2.27, 2.63, 3.17),
  ('fss',         'F.S.S.',                       4, 2.59, 1.37, 1.61, 1.86, 2.22),
  ('benefits',    'Avantages sociaux',            5, 8.875, 7.955, 7.955, 7.955, 7.955),
  ('ins_tax',     'Taxe assurances',              6, 0.330, 0.330, 0.330, 0.330, 0.330),
  ('ccq',         'Cotisation CCQ',               7, 0.43, 0.22, 0.26, 0.30, 0.37),
  ('aecq_acq',    'Cotisation AECQ + ACQ',        8, 0.06, 0.06, 0.06, 0.06, 0.06),
  ('misc_funds',  'Fonds divers',                 9, 0.22, 0.22, 0.22, 0.22, 0.22),
  ('safety_equip','Équipement de sécurité',      10, 0.80, 0.80, 0.80, 0.80, 0.80),
  ('other',       'Autres contributions',        11, 1.52, 0.80, 0.95, 1.09, 1.30),
  ('cnesst',      'CNESST',                      12, 1.93, 1.02, 1.20, 1.38, 1.65)
on conflict (code) do nothing;
