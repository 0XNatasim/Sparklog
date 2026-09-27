-- 0040: per-employee weekly phone/data reimbursement.
--
-- Some employees get a fixed weekly cell-phone data reimbursement (the stub's
-- "remboursement données cellulaire", ~$7/week). Manager-set per employee, like
-- km_rate / storage_compensation. 0 = none. It is a non-taxable reimbursement and
-- feeds labeled estimates only.

alter table public.profiles
  add column if not exists phone_data_reimbursement numeric not null default 0
    check (phone_data_reimbursement >= 0);
