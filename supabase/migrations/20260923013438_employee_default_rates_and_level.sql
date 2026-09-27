-- 0051: standard defaults for newly created employee profiles and a one-time
-- backfill for existing profiles that still have no configured value.

alter table public.profiles
  alter column km_rate set default 0.65,
  alter column phone_data_reimbursement set default 7,
  alter column apprentice_level set default 'compagnon';

-- Existing zero/null values represented the previous unconfigured defaults. Preserve
-- any non-zero rate or explicitly selected apprenticeship level already on file.
update public.profiles
set km_rate = 0.65
where km_rate is null or km_rate = 0;

update public.profiles
set phone_data_reimbursement = 7
where phone_data_reimbursement is null or phone_data_reimbursement = 0;

update public.profiles
set apprentice_level = 'compagnon'
where apprentice_level is null or btrim(apprentice_level) = '';
