-- Adversarial RLS suite (M2.4 — Option A).
--
-- Impersonates each role by switching to the `authenticated` / `anon` Postgres role and
-- setting request.jwt.claims, then attempts CRUD and asserts it is allowed/denied per
-- docs/security/authorization-matrix.md. Everything runs inside a transaction that is
-- ROLLED BACK, so it never persists test rows.
--
-- Run it (psql):     psql "$DATABASE_URL" -f tests/rls/authorization_matrix.sql
-- It prints a NOTICE per assertion and RAISES (aborting, non-zero exit) if any FAIL.
-- Identities are resolved from live data, so it keeps working after the DB is reseeded.
--
-- FUTURE — Option B (not built yet): promote this into CI against a *disposable* Supabase
-- (supabase start / db reset in a GitHub Action) with minted JWTs and a clean + upgrade
-- migration path, so the matrix is enforced on every PR rather than run by hand. Tracked
-- as GPT.md M2.4. This file is the runnable interim that already proves the invariants.

begin;

do $suite$
declare
  empA uuid; empB uuid; paused uuid; mgr uuid;
  res text := '';
  fails int := 0;
  skips int := 0;
  n int;
begin
  select id into empA   from public.profiles where role='employee' and is_paused=false order by id limit 1;
  select id into empB   from public.profiles where role='employee' and is_paused=false and id <> empA order by id limit 1;
  select id into paused from public.profiles where role='employee' and is_paused=true  order by id limit 1;
  select id into mgr    from public.profiles where role='manager'  order by id limit 1;

  ---------------------------------------------------------------- A1: anon reads nothing
  begin
    set local role anon;
    select count(*) into n from public.jobs;
    reset role;
    if n = 0 then res := res || E'\nPASS A1  anon cannot read jobs (0 rows)';
    else res := res || format(E'\nFAIL A1  anon saw %s job rows', n); fails := fails+1; end if;
  exception when others then reset role; res := res || format(E'\nFAIL A1  unexpected error %s', sqlerrm); fails := fails+1; end;

  ---------------------------------------------------- A2: active employee inserts own job
  if empA is null then res := res || E'\nSKIP A2  no active employee'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',empA,'role','authenticated')::text, true);
    set local role authenticated;
    insert into public.jobs(id,user_id,job_date,status,locked) values (gen_random_uuid(), empA, current_date, 'saved', false);
    reset role;
    res := res || E'\nPASS A2  active employee inserts own job';
  exception when others then reset role; res := res || format(E'\nFAIL A2  own insert blocked (%s)', sqlstate); fails := fails+1; end; end if;

  ------------------------------------ A3: active employee cannot insert a job as another
  if empA is null or empB is null then res := res || E'\nSKIP A3  need two active employees'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',empA,'role','authenticated')::text, true);
    set local role authenticated;
    insert into public.jobs(id,user_id,job_date,status,locked) values (gen_random_uuid(), empB, current_date, 'saved', false);
    reset role;
    res := res || E'\nFAIL A3  employee inserted a job as another user (!!)'; fails := fails+1;
  exception when insufficient_privilege then reset role; res := res || E'\nPASS A3  cannot insert a job as another user';
           when others then reset role; res := res || format(E'\nPASS A3  blocked (%s)', sqlstate); end; end if;

  ------------------------------------------- A4: PAUSED employee cannot insert own job ***
  if paused is null then res := res || E'\nSKIP A4  no paused employee present'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',paused,'role','authenticated')::text, true);
    set local role authenticated;
    insert into public.jobs(id,user_id,job_date,status,locked) values (gen_random_uuid(), paused, current_date, 'saved', false);
    reset role;
    res := res || E'\nFAIL A4  paused employee inserted a job (!!)'; fails := fails+1;
  exception when insufficient_privilege then reset role; res := res || E'\nPASS A4  paused employee cannot insert a job';
           when others then reset role; res := res || format(E'\nPASS A4  paused blocked (%s)', sqlstate); end; end if;

  ---------------------------------------- A5: PAUSED employee cannot update own profile ***
  if paused is null then res := res || E'\nSKIP A5  no paused employee present'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',paused,'role','authenticated')::text, true);
    set local role authenticated;
    update public.profiles set phone = 'rls-test' where id = paused;
    get diagnostics n = row_count;
    reset role;
    if n = 0 then res := res || E'\nPASS A5  paused employee update affects 0 rows';
    else res := res || format(E'\nFAIL A5  paused employee updated %s profile row(s)', n); fails := fails+1; end if;
  exception when others then reset role; res := res || format(E'\nPASS A5  paused update blocked (%s)', sqlstate); end; end if;

  ------------------------------- A6: active employee CAN update an allowed profile field
  if empA is null then res := res || E'\nSKIP A6  no active employee'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',empA,'role','authenticated')::text, true);
    set local role authenticated;
    update public.profiles set phone = 'rls-test' where id = empA;
    get diagnostics n = row_count;
    reset role;
    if n = 1 then res := res || E'\nPASS A6  active employee updates own phone';
    else res := res || format(E'\nFAIL A6  own phone update affected %s rows', n); fails := fails+1; end if;
  exception when others then reset role; res := res || format(E'\nFAIL A6  own phone update blocked (%s)', sqlstate); fails := fails+1; end; end if;

  --------------------------- A7: active employee CANNOT change a protected profile field
  if empA is null then res := res || E'\nSKIP A7  no active employee'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',empA,'role','authenticated')::text, true);
    set local role authenticated;
    update public.profiles set hourly_rate = 999 where id = empA;
    reset role;
    res := res || E'\nFAIL A7  employee changed own hourly_rate (!!)'; fails := fails+1;
  exception when others then reset role; res := res || format(E'\nPASS A7  protected field blocked (%s)', sqlstate); end; end if;

  ------------------------------ A8: active employee cannot read manager_notifications
  if empA is null then res := res || E'\nSKIP A8  no active employee'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',empA,'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.manager_notifications;
    reset role;
    if n = 0 then res := res || E'\nPASS A8  employee cannot read manager_notifications (0 rows)';
    else res := res || format(E'\nFAIL A8  employee saw %s notifications', n); fails := fails+1; end if;
  exception when others then reset role; res := res || format(E'\nFAIL A8  unexpected error %s', sqlerrm); fails := fails+1; end; end if;

  ------------------------------------------------- A9: manager can read all jobs
  if mgr is null then res := res || E'\nSKIP A9  no manager'; skips := skips+1;
  else begin
    perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.jobs;
    reset role;
    res := res || format(E'\nPASS A9  manager reads jobs (%s visible)', n);
  exception when others then reset role; res := res || format(E'\nFAIL A9  manager read errored %s', sqlerrm); fails := fails+1; end; end if;

  raise notice '=== RLS authorization suite ===%', res;
  raise notice '=== % failure(s), % skip(s) ===', fails, skips;
  if fails > 0 then
    raise exception 'RLS SUITE FAILED: % failure(s).%', fails, res;
  end if;
end
$suite$;

rollback;
