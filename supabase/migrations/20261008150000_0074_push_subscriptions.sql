-- 0074: Web Push subscriptions (one row per employee device/browser).
-- The browser's PushSubscription endpoint is globally unique. A shared phone can switch
-- accounts, so registration goes through a security-definer RPC that re-homes the row to
-- the caller (a direct upsert would be refused by RLS when the endpoint belongs to
-- someone else). Sending is done server-side with the service role (send_push function).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 256),
  auth text not null check (char_length(auth) between 8 and 128),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions: read own" on public.push_subscriptions;
create policy "push subscriptions: read own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "push subscriptions: delete own" on public.push_subscriptions;
create policy "push subscriptions: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- No insert/update policy on purpose: writes only through register_push_subscription().

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not public.is_active_employee() then
    raise exception using errcode = '42501', message = 'account_paused';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
end;
$function$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
