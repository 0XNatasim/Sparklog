-- 0037: employee number on profiles.
--
-- A short internal employee number (e.g. "09") shown on the paycheque and set by
-- a manager in the Employees tab. Free-form text (leading zeros matter), nullable.
-- Managers (get_my_role() = 'manager') can already write any profile field; the
-- employee-owned whitelist trigger (0018) is unaffected because it only gates an
-- employee editing their own row, and this field is not in that whitelist.

alter table public.profiles add column if not exists employee_number text;
