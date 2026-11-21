-- 0156: import of the Britton overtime table, to compare it with Sparklog (V2.4.299).
--
-- Britton sends a table (Excel) of the overtime it approved: end time, electrician, company, OT, minutes of execution (at the
-- client), return minutes, date, note, total. A manager imports the file in the OCR tab (À traiter › OCR); each line is shown
-- beside the Sparklog sheet of the same OT and day, with the gaps in red. Nothing here changes a job, a proof or a pay.
--
-- Table britton_overtime: one line per (work date, OT number, employee name key); a second import of the same line updates it
-- (replayable, never doubled). Managers read it (get_my_role() = 'manager', aal2); nobody writes it directly: the only way in is
-- import_britton_overtime(rows), which validates every line (1-1000 lines, OT of 3-8 digits, minutes 0-9999) and leaves one line
-- in the Journal (britton_overtime_imported: how many lines, from which day to which day). The names are kept as written by Britton.

create table if not exists public.britton_overtime (
  id uuid primary key default gen_random_uuid(),
  job_date date not null,
  ot text not null check (ot ~ '^[0-9]{3,8}$'),
  employee_name text not null check (char_length(btrim(employee_name)) between 1 and 120),
  name_key text not null check (name_key ~ '^[a-z0-9 ]{1,120}$'),
  company text check (company is null or char_length(company) <= 120),
  ended_at timestamp without time zone,
  client_minutes integer not null check (client_minutes between 0 and 9999),
  return_minutes integer not null check (return_minutes between 0 and 9999),
  total_minutes integer not null check (total_minutes between 0 and 19998),
  note text check (note is null or char_length(note) <= 500),
  imported_by uuid,
  imported_at timestamptz not null default now(),
  unique (job_date, ot, name_key)
);

create index if not exists britton_overtime_job_date_idx on public.britton_overtime (job_date);

alter table public.britton_overtime enable row level security;

drop policy if exists "britton_overtime: manager read" on public.britton_overtime;
create policy "britton_overtime: manager read" on public.britton_overtime
  for select to authenticated using (public.get_my_role() = 'manager');

-- Supabase gives a new table every right to `authenticated` by default: take them all back, then give only the reading.
revoke all on public.britton_overtime from public, anon, authenticated;
grant select on public.britton_overtime to authenticated;

create or replace function public.import_britton_overtime(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  item jsonb;
  total integer;
  inserted_count integer := 0;
  updated_count integer := 0;
  was_inserted boolean;
  first_day date;
  last_day date;
  v_day date;
  digits text;
  person text;
  v_key text;
  client integer;
  returned integer;
  sum_minutes integer;
begin
  if actor_id is null or public.get_my_role() <> 'manager' then
    raise exception using errcode = '42501', message = 'manager_role_required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'britton_rows_invalid';
  end if;
  total := jsonb_array_length(p_rows);
  if total < 1 or total > 1000 then
    raise exception using errcode = '22023', message = 'britton_rows_invalid';
  end if;

  for item in select * from jsonb_array_elements(p_rows) loop
    begin
      v_day := (item ->> 'job_date')::date;
      digits := item ->> 'ot';
      person := btrim(coalesce(item ->> 'employee_name', ''));
      v_key := coalesce(item ->> 'name_key', '');
      client := (item ->> 'client_minutes')::integer;
      returned := (item ->> 'return_minutes')::integer;
      sum_minutes := coalesce((item ->> 'total_minutes')::integer, client + returned);
    exception when others then
      raise exception using errcode = '22023', message = 'britton_row_invalid';
    end;
    if v_day is null or digits !~ '^[0-9]{3,8}$' or char_length(person) not between 1 and 120 or v_key !~ '^[a-z0-9 ]{1,120}$'
       or client is null or returned is null or client not between 0 and 9999 or returned not between 0 and 9999
       or sum_minutes not between 0 and 19998 then
      raise exception using errcode = '22023', message = 'britton_row_invalid';
    end if;
    first_day := least(coalesce(first_day, v_day), v_day);
    last_day := greatest(coalesce(last_day, v_day), v_day);

    insert into public.britton_overtime (job_date, ot, employee_name, name_key, company, ended_at, client_minutes, return_minutes, total_minutes, note, imported_by)
    values (v_day, digits, person, v_key, left(nullif(btrim(coalesce(item ->> 'company', '')), ''), 120),
            nullif(item ->> 'ended_at', '')::timestamp, client, returned, sum_minutes,
            left(nullif(btrim(coalesce(item ->> 'note', '')), ''), 500), actor_id)
    on conflict (job_date, ot, name_key) do update
      set employee_name = excluded.employee_name, company = excluded.company, ended_at = excluded.ended_at,
          client_minutes = excluded.client_minutes, return_minutes = excluded.return_minutes, total_minutes = excluded.total_minutes,
          note = excluded.note, imported_by = excluded.imported_by, imported_at = now()
    returning (xmax = 0) into was_inserted;
    if was_inserted then inserted_count := inserted_count + 1; else updated_count := updated_count + 1; end if;
  end loop;

  insert into public.audit_log (actor_id, actor_name, action, details)
  values (actor_id, public.audit_actor_name(actor_id), 'britton_overtime_imported',
          jsonb_build_object('lines', total, 'inserted', inserted_count, 'updated', updated_count, 'from', first_day, 'to', last_day));
  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count);
end;
$function$;

revoke all on function public.import_britton_overtime(jsonb) from public, anon;
grant execute on function public.import_britton_overtime(jsonb) to authenticated;
