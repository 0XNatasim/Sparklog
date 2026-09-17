-- 0047: default the "first overtime hour at double time" policy to ON.
--
-- This deployment's employer pays the first overtime hour at double time for
-- everyone, so make that the default: new employees start with the flag on, and
-- existing employees are switched on (a manager can still uncheck it per employee).
alter table public.profiles
  alter column overtime_first_hour_double set default true;

update public.profiles set overtime_first_hour_double = true
  where overtime_first_hour_double = false;
