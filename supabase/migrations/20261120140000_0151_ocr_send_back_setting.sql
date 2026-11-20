-- 0151: switch for the « Send back for correction » button of the OCR tab (V2.4.286).
-- Singleton overtime_settings row (readable by every signed-in account, writable by managers through the existing policies).
-- OFF by default: the button only shows once a manager turns it on in Configuration. Replayable.
alter table public.overtime_settings
  add column if not exists send_back_enabled boolean not null default false;
