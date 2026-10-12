-- 0080: editable per-employee storage allowance.
--
-- storage_compensation was a bare flag shown as a fixed "$50". The amount is now stored per
-- employee (default 50, the former fixed value) and paid, when the flag is on, once per worked
-- CCQ week as a non-taxable allowance — like phone_data_reimbursement. Manager-set only: the
-- employee profile whitelist (0018) already rejects employee writes to any other column.

alter table public.profiles
  add column if not exists storage_compensation_amount numeric not null default 50
    check (storage_compensation_amount >= 0);

comment on column public.profiles.storage_compensation_amount is
  'Weekly non-taxable storage allowance ($), paid per worked CCQ week when storage_compensation is true.';
