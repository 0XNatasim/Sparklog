-- 0163: Communications — schedule the sending time of a message (V2.4.337).
-- A scheduled message is saved like any other (manager_broadcasts + its recipients) with scheduled_for = the moment to send it.
-- Until that moment the recipients cannot read it (bell, pop-up, badge): the read policy hides it. A scheduled task (pg_cron, every
-- minute) then calls the send_push Edge Function with { due: true }: it claims the messages whose time has come
-- (claim_due_broadcasts, once each), sends the phone push and touches the recipients' rows so the open apps refresh by themselves.
-- Cancelling = deleting the message before its time (managers already can).

alter table public.manager_broadcasts
  add column if not exists scheduled_for timestamptz,
  add column if not exists scheduled_push_at timestamptz;

comment on column public.manager_broadcasts.scheduled_for is 'null = sent when saved; otherwise the moment the recipients start seeing the message.';
comment on column public.manager_broadcasts.scheduled_push_at is 'When the phone push of a scheduled message was claimed by the scheduled task (once).';

-- A time already in the past (more than 5 minutes) or more than 90 days away is refused when the message is saved.
create or replace function public.manager_broadcasts_check_schedule()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.scheduled_for is not null
     and (new.scheduled_for < now() - interval '5 minutes' or new.scheduled_for > now() + interval '90 days') then
    raise exception using errcode = '23514', message = 'invalid_schedule';
  end if;
  return new;
end;
$$;
drop trigger if exists manager_broadcasts_check_schedule on public.manager_broadcasts;
create trigger manager_broadcasts_check_schedule before insert on public.manager_broadcasts
  for each row execute function public.manager_broadcasts_check_schedule();

-- The recipient only sees a message once its time has come (and while it is not withdrawn from them).
drop policy if exists "broadcasts: recipient read" on public.manager_broadcasts;
create policy "broadcasts: recipient read" on public.manager_broadcasts
  for select to authenticated
  using (
    (scheduled_for is null or scheduled_for <= now())
    and exists (
      select 1 from public.broadcast_recipients r
       where r.broadcast_id = id and r.employee_id = auth.uid() and r.withdrawn_at is null
    )
  );

-- Messages whose time has come and whose push was not claimed yet: claimed once (service role only), then the recipients' rows are
-- touched (a no-op update still reaches the open apps through realtime) so the bell and the pop-up refresh.
create or replace function public.claim_due_broadcasts()
returns table (broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with due as (
    select b.id from public.manager_broadcasts b
     where b.scheduled_for is not null and b.scheduled_for <= now() and b.scheduled_push_at is null
     order by b.scheduled_for
     for update skip locked
     limit 50
  ), claimed as (
    update public.manager_broadcasts b set scheduled_push_at = now()
      from due where b.id = due.id
    returning b.id
  ), touched as (
    update public.broadcast_recipients r set withdrawn_at = r.withdrawn_at
      from claimed where r.broadcast_id = claimed.id
    returning r.broadcast_id
  )
  select c.id from claimed c;
end;
$function$;
revoke all on function public.claim_due_broadcasts() from public, anon, authenticated;
grant execute on function public.claim_due_broadcasts() to service_role;

select cron.schedule('scheduled-broadcasts', '* * * * *',
  $$select public.invoke_scheduled_function('send_push', '{"due": true}'::jsonb)$$);
