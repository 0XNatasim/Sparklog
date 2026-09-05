-- Lightweight health/keep-warm endpoint. Touches Postgres so an external heartbeat
-- (GitHub Actions, see .github/workflows/keep-warm.yml) can keep the free-tier project
-- warm 24/7. Returns a constant; exposes no data. Callable by anon (the public key
-- already ships in the frontend).
create or replace function public.ping()
returns integer language sql stable as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;
