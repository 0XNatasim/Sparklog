-- 0049: default the "return time without social benefits over 8h" policy to ON.
--
-- This deployment's employer applies the rule for everyone, so make it the default:
-- new employees start with the flag on, and existing employees are switched on (a
-- manager can still uncheck it per employee).
alter table public.profiles
  alter column return_overtime_no_benefits set default true;

update public.profiles set return_overtime_no_benefits = true
  where return_overtime_no_benefits = false;
