-- 0107: Communications — edit a sent message, withdraw it from those who have not read it (V2.4.164).
--
-- Edit (edit_broadcast): any time. The previous text and attachments are kept in broadcast_revisions
-- (managers only). The manager chooses whether the people who already pressed OK must read it again:
-- if so, their OK is cleared (the message pops up again with a « Modifié » label) and the app sends
-- them a push. People who have not read it yet simply see the corrected version.
-- Withdraw (withdraw_broadcast_unread): the message disappears for the recipients who have not pressed
-- OK; those who read it keep it. The row stays (withdrawn_at) so the manager log still shows who it was
-- withdrawn from, but RLS hides it from the employee, including from an app not yet updated.
-- Both write one line to the Journal (audit_log).

alter table public.manager_broadcasts
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

alter table public.broadcast_recipients
  add column if not exists withdrawn_at timestamptz;

-- Previous versions of an edited message, newest last.
create table if not exists public.broadcast_revisions (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.manager_broadcasts(id) on delete cascade,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  edited_at timestamptz not null default now(),
  edited_by uuid references public.profiles(id) on delete set null,
  reread boolean not null default false,
  reread_count integer not null default 0
);
create index if not exists broadcast_revisions_broadcast_idx on public.broadcast_revisions (broadcast_id, edited_at);

alter table public.broadcast_revisions enable row level security;
drop policy if exists "broadcast revisions: manager read" on public.broadcast_revisions;
create policy "broadcast revisions: manager read" on public.broadcast_revisions
  for select to authenticated using (public.get_my_role() = 'manager');
revoke all on public.broadcast_revisions from anon;
revoke insert, update, delete on public.broadcast_revisions from authenticated;

-- A withdrawn recipient no longer sees the message (bell, pop-up, push badge count).
drop policy if exists "broadcasts: recipient read" on public.manager_broadcasts;
create policy "broadcasts: recipient read" on public.manager_broadcasts
  for select to authenticated
  using (exists (
    select 1 from public.broadcast_recipients r
     where r.broadcast_id = id and r.employee_id = auth.uid() and r.withdrawn_at is null
  ));

drop policy if exists "broadcast recipients: employee read own" on public.broadcast_recipients;
create policy "broadcast recipients: employee read own" on public.broadcast_recipients
  for select to authenticated
  using (employee_id = auth.uid() and withdrawn_at is null);

drop policy if exists "broadcast recipients: employee ack own" on public.broadcast_recipients;
create policy "broadcast recipients: employee ack own" on public.broadcast_recipients
  for update to authenticated
  using (employee_id = auth.uid() and withdrawn_at is null)
  with check (employee_id = auth.uid() and withdrawn_at is null);

-- Attachments the app writes: [{path: "<uuid>.jpg|pdf", kind: image|pdf, name}], at most 10 (0096).
create or replace function public.broadcast_attachments_valid(p_attachments jsonb)
returns boolean language sql immutable set search_path to '' as $$
  select jsonb_typeof(p_attachments) = 'array'
     and jsonb_array_length(p_attachments) <= 10
     and not exists (
       select 1 from jsonb_array_elements(p_attachments) a
        where jsonb_typeof(a) <> 'object'
           or coalesce(a ->> 'path', '') !~ '^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|pdf)$'
           or coalesce(a ->> 'kind', '') not in ('image', 'pdf')
     );
$$;

create or replace function public.edit_broadcast(
  p_broadcast_id uuid,
  p_body text,
  p_attachments jsonb,
  p_reread boolean
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  old_row public.manager_broadcasts%rowtype;
  new_body text := btrim(coalesce(p_body, ''));
  new_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  reread_count integer := 0;
  pending_count integer := 0;
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'broadcast_edit_not_allowed' using errcode = '42501';
  end if;
  if not public.broadcast_attachments_valid(new_attachments) then
    raise exception 'broadcast_attachments_invalid' using errcode = '22023';
  end if;
  if new_body = '' and jsonb_array_length(new_attachments) = 0 then
    raise exception 'broadcast_empty' using errcode = '22023';
  end if;

  select * into old_row from public.manager_broadcasts where id = p_broadcast_id for update;
  if not found then
    raise exception 'broadcast_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_reread, false) then
    update public.broadcast_recipients
       set acknowledged_at = null
     where broadcast_id = p_broadcast_id and acknowledged_at is not null and withdrawn_at is null;
    get diagnostics reread_count = row_count;
  end if;
  select count(*) into pending_count from public.broadcast_recipients
   where broadcast_id = p_broadcast_id and acknowledged_at is null and withdrawn_at is null;

  insert into public.broadcast_revisions (broadcast_id, body, attachments, edited_by, reread, reread_count)
  values (p_broadcast_id, old_row.body, old_row.attachments, actor_id, coalesce(p_reread, false), reread_count);

  update public.manager_broadcasts
     set body = new_body,
         attachments = new_attachments,
         -- First picture, for an app that predates 0096 (same rule as broadcastAttachmentColumns).
         image_path = (select a ->> 'path' from jsonb_array_elements(new_attachments) with ordinality as e(a, n)
                        where a ->> 'kind' = 'image' order by n limit 1),
         edited_at = now(),
         edited_by = actor_id
   where id = p_broadcast_id;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'broadcast_edited', null, left(new_body, 80), null,
          jsonb_build_object('broadcast_id', p_broadcast_id, 'reread', coalesce(p_reread, false),
                             'reread_count', reread_count, 'pending_count', pending_count));

  return jsonb_build_object('reread_count', reread_count, 'pending_count', pending_count);
end;
$$;

create or replace function public.withdraw_broadcast_unread(p_broadcast_id uuid)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  msg text;
  withdrawn integer;
begin
  if actor_id is null or public.get_my_role() is distinct from 'manager' then
    raise exception 'broadcast_withdraw_not_allowed' using errcode = '42501';
  end if;
  select body into msg from public.manager_broadcasts where id = p_broadcast_id for update;
  if not found then
    raise exception 'broadcast_not_found' using errcode = 'P0002';
  end if;

  update public.broadcast_recipients
     set withdrawn_at = now()
   where broadcast_id = p_broadcast_id and acknowledged_at is null and withdrawn_at is null;
  get diagnostics withdrawn = row_count;

  if withdrawn > 0 then
    insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
    values (actor_id, public.audit_actor_name(actor_id), 'broadcast_withdrawn', null, left(msg, 80), null,
            jsonb_build_object('broadcast_id', p_broadcast_id, 'count', withdrawn));
  end if;
  return withdrawn;
end;
$$;

revoke all on function public.broadcast_attachments_valid(jsonb) from public, anon;
revoke all on function public.edit_broadcast(uuid, text, jsonb, boolean) from public, anon;
revoke all on function public.withdraw_broadcast_unread(uuid) from public, anon;
grant execute on function public.broadcast_attachments_valid(jsonb) to authenticated;
grant execute on function public.edit_broadcast(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.withdraw_broadcast_unread(uuid) to authenticated;
