-- Performance advisor "auth_rls_initplan": wrap auth/role function calls in (select …) so
-- Postgres evaluates them ONCE per statement instead of once per row. Behaviour-preserving —
-- we rewrite each policy's OWN normalized expression, only wrapping the function calls. The
-- guard skips already-wrapped policies so re-running can never double-wrap.
do $$
declare
  r record;
  nu text;
  nc text;
  pat text := '(auth\.uid|auth\.role|auth\.jwt|get_my_role|is_privileged|is_active_employee|is_not_paused)\(\)';
begin
  for r in
    select c.relname as tbl, p.polname as name,
      pg_get_expr(p.polqual, p.polrelid) as u,
      pg_get_expr(p.polwithcheck, p.polrelid) as c
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
  loop
    if (r.u is not null and r.u ~ '\(SELECT (auth\.|get_my_role|is_privileged|is_active_employee|is_not_paused)')
       or (r.c is not null and r.c ~ '\(SELECT (auth\.|get_my_role|is_privileged|is_active_employee|is_not_paused)') then
      continue;
    end if;
    nu := case when r.u is null then null else regexp_replace(r.u, pat, '(SELECT \1())', 'g') end;
    nc := case when r.c is null then null else regexp_replace(r.c, pat, '(SELECT \1())', 'g') end;
    if (nu is distinct from r.u) or (nc is distinct from r.c) then
      if r.u is not null and r.c is not null then
        execute format('alter policy %I on public.%I using (%s) with check (%s)', r.name, r.tbl, nu, nc);
      elsif r.u is not null then
        execute format('alter policy %I on public.%I using (%s)', r.name, r.tbl, nu);
      elsif r.c is not null then
        execute format('alter policy %I on public.%I with check (%s)', r.name, r.tbl, nc);
      end if;
    end if;
  end loop;
end $$;
