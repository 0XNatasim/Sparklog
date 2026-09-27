-- Applied to production as talon_boss_approval (2026-09-22). "Approve by Boss": an owner marks
-- a comptabilisé talon official (drops the DRAFT watermark).
alter table public.payroll_period_ledger
  add column if not exists boss_approved boolean not null default false,
  add column if not exists boss_approved_by uuid references public.profiles(id),
  add column if not exists boss_approved_at timestamptz;

comment on column public.payroll_period_ledger.boss_approved is
  'Owner-approved (official) talon: when true the pay stub drops the DRAFT watermark.';

create or replace function public.set_talon_boss_approval(
  p_user_id uuid, p_period_end date, p_approved boolean, p_tax_year int default 2026
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then
    raise exception 'forbidden: owner role required' using errcode = '42501';
  end if;
  update public.payroll_period_ledger
     set boss_approved = p_approved,
         boss_approved_by = case when p_approved then auth.uid() else null end,
         boss_approved_at = case when p_approved then now() else null end
   where user_id = p_user_id and period_end = p_period_end and tax_year = p_tax_year;
end $$;

grant execute on function public.set_talon_boss_approval(uuid, date, boolean, int) to authenticated;
