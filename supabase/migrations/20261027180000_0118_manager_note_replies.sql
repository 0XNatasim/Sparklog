-- 0118: replies on shared notes (V2.4.190).
--
-- A shared note (0111) becomes a small conversation between the managers (the owner and Karine): under the
-- note, each manager writes replies, shown as chat bubbles (mine on the right, the others' on the left in
-- another colour, with the name). A reply can only be added to a SHARED note; it is visible to whoever sees
-- the note (manager_notes RLS: the author, or every manager while it is shared). Its author may delete it;
-- nobody edits it. Deleting the note deletes its replies.
--
-- manager_note_reads remembers, per manager and note, when the conversation was last seen, so the app can
-- show « N nouvelles réponses » on the card and count those notes in the badge on « Notes » in the menu.
-- Everything requires a manager-level session (get_my_role() = 'manager', so aal2 / two-factor — 0103).

create table if not exists public.manager_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.manager_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint manager_note_replies_body_chk check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists manager_note_replies_note_created_idx
  on public.manager_note_replies (note_id, created_at);

-- The time of a reply is the server's (the order of the conversation cannot be forged).
create or replace function public.manager_note_replies_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists manager_note_replies_guard on public.manager_note_replies;
create trigger manager_note_replies_guard before insert on public.manager_note_replies
  for each row execute function public.manager_note_replies_guard();

alter table public.manager_note_replies enable row level security;

drop policy if exists "manager_note_replies: read with the note" on public.manager_note_replies;
drop policy if exists "manager_note_replies: reply to a shared note" on public.manager_note_replies;
drop policy if exists "manager_note_replies: delete own" on public.manager_note_replies;

-- The subqueries read manager_notes under its own RLS: only a note this manager can see qualifies.
create policy "manager_note_replies: read with the note" on public.manager_note_replies
  for select to authenticated
  using (public.get_my_role() = 'manager'
    and exists (select 1 from public.manager_notes n where n.id = note_id));

create policy "manager_note_replies: reply to a shared note" on public.manager_note_replies
  for insert to authenticated
  with check (user_id = auth.uid() and public.get_my_role() = 'manager'
    and exists (select 1 from public.manager_notes n where n.id = note_id and n.shared));

create policy "manager_note_replies: delete own" on public.manager_note_replies
  for delete to authenticated
  using (user_id = auth.uid() and public.get_my_role() = 'manager');

revoke all on public.manager_note_replies from anon, public;
grant select, insert, delete on public.manager_note_replies to authenticated;
revoke all on function public.manager_note_replies_guard() from public, anon, authenticated;

-- When each manager last saw each conversation (one row per manager and note, their own rows only).
create table if not exists public.manager_note_reads (
  note_id uuid not null references public.manager_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create or replace function public.manager_note_reads_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.read_at := now();
  return new;
end;
$$;

drop trigger if exists manager_note_reads_guard on public.manager_note_reads;
create trigger manager_note_reads_guard before insert or update on public.manager_note_reads
  for each row execute function public.manager_note_reads_guard();

alter table public.manager_note_reads enable row level security;

drop policy if exists "manager_note_reads: own rows" on public.manager_note_reads;
create policy "manager_note_reads: own rows" on public.manager_note_reads
  for all to authenticated
  using (user_id = auth.uid() and public.get_my_role() = 'manager')
  with check (user_id = auth.uid() and public.get_my_role() = 'manager'
    and exists (select 1 from public.manager_notes n where n.id = note_id));

revoke all on public.manager_note_reads from anon, public;
grant select, insert, update, delete on public.manager_note_reads to authenticated;
revoke all on function public.manager_note_reads_guard() from public, anon, authenticated;

-- Replies written by someone else after I last saw the conversation, per note (badge and « nouvelles »).
-- security invoker: the RLS above decides what is counted.
create or replace function public.my_note_unread_replies()
returns table (note_id uuid, unread integer)
language sql stable security invoker set search_path to 'public' as $$
  select r.note_id, count(*)::integer
  from public.manager_note_replies r
  left join public.manager_note_reads s on s.note_id = r.note_id and s.user_id = auth.uid()
  where r.user_id <> auth.uid() and (s.read_at is null or r.created_at > s.read_at)
  group by r.note_id;
$$;

revoke all on function public.my_note_unread_replies() from public, anon;
grant execute on function public.my_note_unread_replies() to authenticated;
