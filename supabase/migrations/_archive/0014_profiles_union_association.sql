-- Employee-selected union association. Historical employee and job data is unaffected.
alter table public.profiles
  add column if not exists union_association text;

alter table public.profiles
  drop constraint if exists profiles_union_association_code,
  add constraint profiles_union_association_code
    check (union_association is null or union_association in ('CSD', 'CSN', 'CPQMCI', 'FTQ', 'SQC'));
