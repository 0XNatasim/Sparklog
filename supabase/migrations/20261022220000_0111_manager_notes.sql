-- 0111: notes with an optional reminder, in the Gestion menu (V2.4.169).
--
-- Each manager / owner writes notes (« fais-moi penser à … »), either PRIVATE (only the author sees them)
-- or SHARED with the managers (every manager-level account sees them). A note can carry a reminder
-- (remind_at): once that time has passed and the note is not done, it counts in the badge on « Notes » in
-- the side menu — for a shared note, in every manager's badge, until someone marks it done (done_by).
--   private: only the author reads, changes or deletes it; nobody else, not even the owner, sees it.
--   shared:  every manager reads it and may edit it, snooze it or mark it done; only the author deletes it
--            or makes it private again.
-- Everything requires a manager-level session (get_my_role() = 'manager', so aal2 / two-factor — 0103).
-- The author never changes (trigger); deleting an account deletes its notes.

create table if not exists public.manager_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  shared boolean not null default false,
  remind_at timestamptz,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_notes_body_chk check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists manager_notes_open_reminders_idx
  on public.manager_notes (remind_at)
  where done_at is null and remind_at is not null;
create index if not exists manager_notes_user_created_idx
  on public.manager_notes (user_id, created_at desc);
create index if not exists manager_notes_shared_created_idx
  on public.manager_notes (created_at desc) where shared;

-- The author is fixed; done_by records who marked the note done (cleared when it is reopened).
create or replace function public.manager_notes_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.done_by := case when new.done_at is not null then auth.uid() end;
    return new;
  end if;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.done_by := case
    when new.done_at is null then null
    when old.done_at is null then auth.uid()
    else old.done_by
  end;
  return new;
end;
$$;

drop trigger if exists manager_notes_guard on public.manager_notes;
create trigger manager_notes_guard before insert or update on public.manager_notes
  for each row execute function public.manager_notes_guard();

drop trigger if exists manager_notes_updated_at on public.manager_notes;
create trigger manager_notes_updated_at before update on public.manager_notes
  for each row execute function public.set_updated_at();

alter table public.manager_notes enable row level security;

drop policy if exists "manager_notes: own notes" on public.manager_notes;
drop policy if exists "manager_notes: read own or shared" on public.manager_notes;
drop policy if exists "manager_notes: insert own" on public.manager_notes;
drop policy if exists "manager_notes: update own or shared" on public.manager_notes;
drop policy if exists "manager_notes: delete own" on public.manager_notes;

create policy "manager_notes: read own or shared" on public.manager_notes
  for select to authenticated
  using (public.get_my_role() = 'manager' and (user_id = auth.uid() or shared));

create policy "manager_notes: insert own" on public.manager_notes
  for insert to authenticated
  with check (user_id = auth.uid() and public.get_my_role() = 'manager');

-- A non-author can edit a shared note but cannot make it private (the row must stay shared for them).
create policy "manager_notes: update own or shared" on public.manager_notes
  for update to authenticated
  using (public.get_my_role() = 'manager' and (user_id = auth.uid() or shared))
  with check (public.get_my_role() = 'manager' and (user_id = auth.uid() or shared));

create policy "manager_notes: delete own" on public.manager_notes
  for delete to authenticated
  using (user_id = auth.uid() and public.get_my_role() = 'manager');

revoke all on public.manager_notes from anon, public;
grant select, insert, update, delete on public.manager_notes to authenticated;
revoke all on function public.manager_notes_guard() from public, anon, authenticated;
