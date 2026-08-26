-- Seed the toggle row for the "Réunion sécurité" Teams meeting link.  The
-- Forms manager only UPDATEs employee_forms by form_id, so a new form needs its
-- row to exist here for the on/off toggle to persist.
insert into public.employee_forms (form_id, enabled) values
  ('security-meeting', false)
on conflict (form_id) do nothing;
