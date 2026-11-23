-- 0159: which pages / tabs each manager opens every day (V2.4.320). Owner-only reading, one counter per (person, day, page, tab).
--
-- The app calls log_manager_page_view(page, tab) once the manager has stayed 1.5 s on a page / tab. The function is security definer
-- and does nothing for anybody who is not a manager account (get_my_role() = 'manager': owner / manager / admin with the 2FA code).
-- Only the page and tab NAMES are stored (letters, digits, / _ - . ; at most 60 characters): never the content seen, an employee, a
-- job, a filter or a time of day beyond the last visit. The Montréal date is the day. Nothing before this migration is known.
-- Reading: the owner only (profiles.role = 'owner'), for the Journal › Onglets consultés screen. No direct write for anybody.
-- Replayable.

create table if not exists public.manager_page_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  view_day date not null,
  page text not null check (char_length(page) between 1 and 60 and page ~ '^[a-z0-9/_.-]+$'),
  tab text not null default '' check (char_length(tab) <= 60 and tab ~ '^[A-Za-z0-9_.-]*$'),
  views integer not null default 1 check (views > 0),
  last_at timestamptz not null default now(),
  primary key (user_id, view_day, page, tab)
);

alter table public.manager_page_views enable row level security;

revoke all on public.manager_page_views from anon, public, authenticated;
grant select on public.manager_page_views to authenticated;

drop policy if exists "page views: owner read" on public.manager_page_views;
create policy "page views: owner read" on public.manager_page_views
  for select to authenticated
  using (
    public.get_my_role() = 'manager'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create or replace function public.log_manager_page_view(p_page text, p_tab text default '')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  clean_page text := lower(btrim(coalesce(p_page, '')));
  clean_tab text := btrim(coalesce(p_tab, ''));
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    return;
  end if;
  if clean_page !~ '^[a-z0-9/_.-]{1,60}$' or clean_tab !~ '^[A-Za-z0-9_.-]{0,60}$' then
    return;
  end if;
  insert into public.manager_page_views (user_id, view_day, page, tab)
  values (actor_id, (now() at time zone 'America/Toronto')::date, clean_page, clean_tab)
  on conflict (user_id, view_day, page, tab)
  do update set views = public.manager_page_views.views + 1, last_at = now();
end;
$function$;

revoke all on function public.log_manager_page_view(text, text) from public, anon;
grant execute on function public.log_manager_page_view(text, text) to authenticated;
