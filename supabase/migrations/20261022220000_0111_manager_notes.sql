-- 0111: personal notes with an optional reminder, in the Gestion menu (V2.4.169).
--
-- Each manager / owner writes notes for themselves (« fais-moi penser à … »). A note can carry a
-- reminder (remind_at): once that time has passed and the note is not done, it counts in the badge on
-- « Notes » in the side menu. Notes are private: only their author reads or changes them, and only in a
-- manager-level session (get_my_role() = 'manager', so aal2 / two-factor — 0103). Nobody else, not even
-- the owner, sees another person's notes. Deleting the account deletes its notes.

create table if not exists public.manager_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  remind_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_notes_body_chk check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists manager_notes_open_reminders_idx
  on public.manager_notes (user_id, remind_at)
  where done_at is null and remind_at is not null;
create index if not exists manager_notes_user_created_idx
  on public.manager_notes (user_id, created_at desc);

drop trigger if exists manager_notes_updated_at on public.manager_notes;
create trigger manager_notes_updated_at before update on public.manager_notes
  for each row execute function public.set_updated_at();

alter table public.manager_notes enable row level security;

drop policy if exists "manager_notes: own notes" on public.manager_notes;
create policy "manager_notes: own notes" on public.manager_notes
  for all to authenticated
  using (user_id = auth.uid() and public.get_my_role() = 'manager')
  with check (user_id = auth.uid() and public.get_my_role() = 'manager');

revoke all on public.manager_notes from anon, public;
grant select, insert, update, delete on public.manager_notes to authenticated;
