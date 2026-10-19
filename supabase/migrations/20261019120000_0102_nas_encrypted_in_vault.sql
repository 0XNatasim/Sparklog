-- 0102: the NAS is stored ENCRYPTED in Supabase Vault (V2.4.156).
--
-- Until now employee_sensitive.nas held the 9 digits as plain text: RLS kept the browser out (0026, 0084),
-- but a copy of the database (dump, restored backup) showed every NAS. Each NAS is now a Vault secret,
-- encrypted with a key Supabase keeps OUTSIDE the database: a dump only contains ciphertext.
-- employee_sensitive keeps the secret's id (nas_secret_id); the plain-text column is dropped.
--
-- The four owner-only RPCs keep their exact signatures, checks and audit rows (0026, 0084), so the app does
-- not change; they read vault.decrypted_secrets inside security definer. set_nas also rejects a number whose
-- check digit is wrong (Luhn, like every Canadian SIN): « invalid_nas ». The value already on file is moved as
-- is (not re-validated). Deleting an employee's row also deletes its secret.

-- Canadian SIN check digit (Luhn). Pure, no data access.
create or replace function public.sin_is_valid(p_sin text)
returns boolean language sql immutable set search_path to '' as $$
  select p_sin ~ '^[0-9]{9}$' and (
    select sum(case when i % 2 = 0 then (substr(p_sin, i, 1)::int * 2) / 10 + (substr(p_sin, i, 1)::int * 2) % 10
                    else substr(p_sin, i, 1)::int end) % 10 = 0
      from generate_series(1, 9) as i
  );
$$;

alter table public.employee_sensitive add column if not exists nas_secret_id uuid;

-- Move every plain-text NAS into Vault, then drop the column (and its check constraint).
do $$
declare r record; sid uuid;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'employee_sensitive' and column_name = 'nas') then
    for r in execute 'select user_id, nas from public.employee_sensitive where nas is not null and nas_secret_id is null' loop
      delete from vault.secrets where name = 'sparklog_nas_' || r.user_id::text;
      sid := vault.create_secret(r.nas, 'sparklog_nas_' || r.user_id::text, 'NAS employé — Sparklog (employee_sensitive)');
      update public.employee_sensitive set nas_secret_id = sid where user_id = r.user_id;
    end loop;
    alter table public.employee_sensitive drop column nas;
  end if;
end;
$$;

comment on table public.employee_sensitive is
  'NAS vault index: one row per employee with a NAS; the number itself is a Supabase Vault secret (nas_secret_id). RPC-only (0084), encrypted since 0102.';

-- reveal_nas: unchanged contract (owner only, audited), reads the decrypted secret.
create or replace function public.reveal_nas(target uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v text; tname text;
begin
  if not public.is_privileged() then raise exception 'Not authorized to view sensitive data'; end if;
  select d.decrypted_secret into v
    from public.employee_sensitive s join vault.decrypted_secrets d on d.id = s.nas_secret_id
   where s.user_id = target;
  select full_name into tname from public.profiles where id = target;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name)
    values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'nas_reveal', target, tname);
  return v;
end;
$function$;

-- set_nas: owner only, 9 digits with a valid check digit, audited (never the value); writes the secret.
create or replace function public.set_nas(target uuid, p_nas text)
returns boolean
language plpgsql security definer set search_path to 'public' as $function$
declare
  clean text := nullif(regexp_replace(coalesce(p_nas, ''), '\D', '', 'g'), '');
  sid uuid;
begin
  if not public.is_privileged() then
    raise exception using errcode = '42501', message = 'Not authorized to edit sensitive data';
  end if;
  if target is null or not exists (select 1 from public.profiles p where p.id = target) then
    raise exception using errcode = 'P0002', message = 'employee_not_found';
  end if;
  if clean is not null and not public.sin_is_valid(clean) then
    raise exception using errcode = '23514', message = 'invalid_nas';
  end if;
  insert into public.employee_sensitive (user_id, updated_at) values (target, now())
  on conflict (user_id) do nothing;
  select s.nas_secret_id into sid from public.employee_sensitive s where s.user_id = target for update;
  if clean is null then
    update public.employee_sensitive set nas_secret_id = null, updated_at = now() where user_id = target;
    if sid is not null then delete from vault.secrets where id = sid; end if;
  elsif sid is null then
    delete from vault.secrets where name = 'sparklog_nas_' || target::text; -- stale secret, if any
    sid := vault.create_secret(clean, 'sparklog_nas_' || target::text, 'NAS employé — Sparklog (employee_sensitive)');
    update public.employee_sensitive set nas_secret_id = sid, updated_at = now() where user_id = target;
  else
    perform vault.update_secret(sid, clean);
    update public.employee_sensitive set updated_at = now() where user_id = target;
  end if;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'nas_update',
          target, (select full_name from public.profiles where id = target),
          jsonb_build_object('cleared', clean is null));
  return clean is not null;
end;
$function$;

create or replace function public.nas_presence()
returns table(user_id uuid)
language sql stable security definer set search_path to 'public' as $function$
  select s.user_id from public.employee_sensitive s
  where s.nas_secret_id is not null and public.is_privileged();
$function$;

-- export_ccq_nas: unchanged contract (owner only, written reason, 5 / hour, 500 max, audited).
create or replace function public.export_ccq_nas(p_user_ids uuid[], p_reason text)
returns table(user_id uuid, nas text)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  caller_id uuid := auth.uid();
  reason text := btrim(coalesce(p_reason, ''));
  recent integer;
  found integer;
begin
  if not public.is_privileged() then
    raise exception using errcode = '42501', message = 'Not authorized to view sensitive data';
  end if;
  if length(reason) < 10 then
    raise exception using errcode = '23514', message = 'export_reason_required';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;
  if cardinality(p_user_ids) > 500 then
    raise exception using errcode = '23514', message = 'too_many_employees';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nas_bulk_export:' || caller_id::text, 0));
  select count(*) into recent from public.audit_log a
   where a.actor_id = caller_id and a.action = 'nas_bulk_export'
     and a.created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception using errcode = 'P0001', message = 'nas_export_rate_limited';
  end if;
  select count(*) into found from public.employee_sensitive s
   where s.user_id = any(p_user_ids) and s.nas_secret_id is not null;
  insert into public.audit_log (actor_id, actor_name, action, details)
  values (caller_id, (select full_name from public.profiles where id = caller_id), 'nas_bulk_export',
          jsonb_build_object('reason', left(reason, 500), 'requested', cardinality(p_user_ids), 'returned', found,
                             'purpose', 'ccq_monthly_report'));
  return query
    select s.user_id, d.decrypted_secret::text
      from public.employee_sensitive s join vault.decrypted_secrets d on d.id = s.nas_secret_id
     where s.user_id = any(p_user_ids);
end;
$function$;

-- Deleting a vault row (employee deleted: profiles → cascade) deletes its secret too.
create or replace function public.employee_sensitive_drop_secret()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if old.nas_secret_id is not null then delete from vault.secrets where id = old.nas_secret_id; end if;
  return old;
end;
$function$;
drop trigger if exists employee_sensitive_drop_secret on public.employee_sensitive;
create trigger employee_sensitive_drop_secret after delete on public.employee_sensitive
  for each row execute function public.employee_sensitive_drop_secret();

revoke all on function public.reveal_nas(uuid) from public, anon;
revoke all on function public.set_nas(uuid, text) from public, anon;
revoke all on function public.nas_presence() from public, anon;
revoke all on function public.export_ccq_nas(uuid[], text) from public, anon;
revoke all on function public.employee_sensitive_drop_secret() from public, anon, authenticated;
grant execute on function public.reveal_nas(uuid) to authenticated;
grant execute on function public.set_nas(uuid, text) to authenticated;
grant execute on function public.nas_presence() to authenticated;
grant execute on function public.export_ccq_nas(uuid[], text) to authenticated;
