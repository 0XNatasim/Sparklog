-- Manager → employee SMS announcements.
--
-- Two tables backing the notification/messaging center:
--   messages            one row per announcement a manager sends
--   message_recipients  one row per (message, employee) fan-out, carrying
--                       per-recipient delivery state so real providers
--                       (Twilio, Telnyx, …) can update status/webhooks later.
--
-- All writes happen through the send_sms edge function using the service role;
-- managers read their history through RLS.

-- ── messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references auth.users (id) on delete set null,
  sender_name     text,
  channel         text not null default 'sms',
  body            text not null,
  recipient_count integer not null default 0,
  segment_count   integer not null default 1,   -- SMS segments per recipient
  provider        text,                          -- 'mock' | 'twilio' | 'telnyx' | …
  status          text not null default 'queued', -- queued | sending | sent | partial | failed
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

-- ── message_recipients ──────────────────────────────────────────────────────
create table if not exists public.message_recipients (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.messages (id) on delete cascade,
  employee_id     uuid references public.profiles (id) on delete set null,
  name            text,
  phone           text,
  delivery_status text not null default 'queued', -- queued | sent | delivered | failed | skipped
  provider_sid    text,                            -- provider message id, for webhook reconciliation
  error           text,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Fast history + drill-down lookups
create index if not exists messages_created_idx
  on public.messages (created_at desc);

create index if not exists message_recipients_message_idx
  on public.message_recipients (message_id);

create index if not exists message_recipients_employee_idx
  on public.message_recipients (employee_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Managers can read the whole history; the edge function writes via service role
-- (which bypasses RLS), so no INSERT/UPDATE policy is needed for clients.
alter table public.messages           enable row level security;
alter table public.message_recipients enable row level security;

create policy "messages: manager read"
  on public.messages for select
  using (public.get_my_role() = 'manager');

create policy "message_recipients: manager read"
  on public.message_recipients for select
  using (public.get_my_role() = 'manager');
