-- Meals become manager-approved. Employees' inserts are COERCED to pending
-- (not rejected) so the currently-deployed app does not break; managers approve
-- and set the payroll treatment. Employees still cannot change review fields on
-- update. Historical already-approved meals are left as-is.
create or replace function public.protect_meal_review_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and public.get_my_role() is distinct from 'manager' then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.payroll_treatment := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      if new.status is distinct from old.status
         or new.payroll_treatment is distinct from old.payroll_treatment
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Employees cannot change meal claim review fields';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists meal_protect_review_fields on public.meal_claims;
create trigger meal_protect_review_fields before insert or update on public.meal_claims
  for each row execute function public.protect_meal_review_fields();
revoke all on function public.protect_meal_review_fields() from public, anon, authenticated;
