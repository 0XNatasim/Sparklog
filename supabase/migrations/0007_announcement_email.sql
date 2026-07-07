-- Switch the manager announcement channel from SMS to email.
--
-- The messages / message_recipients tables from 0006 are channel-agnostic;
-- these columns add what email needs:
--   messages.subject             the email subject line
--   message_recipients.email     the destination address (parallel to .phone)
--
-- channel default flips to 'email'. The .phone column is kept so the same
-- tables can carry SMS again later without another migration.

alter table public.messages
  add column if not exists subject text;

alter table public.messages
  alter column channel set default 'email';

alter table public.message_recipients
  add column if not exists email text;
