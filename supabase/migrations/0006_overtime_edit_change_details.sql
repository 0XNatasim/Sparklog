-- Record exactly what changed when an employee edits an overtime job, so the
-- manager can see the field-level diff on the "overtime job edited" notification.
--
-- A `changes` jsonb column stores { field: { from, to } } for the corrected
-- fields. When several saves happen before a manager acknowledges the
-- notification, the diff accumulates: "from" keeps the earliest value and "to"
-- tracks the latest. Fields that end back at their original value are dropped.

alter table public.manager_notifications
  add column if not exists changes jsonb;

create or replace function public.notify_overtime_job_edit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  proof public.overtime_evidence%rowtype;
  diff jsonb := '{}'::jsonb;
  existing_id uuid;
  existing_changes jsonb;
  merged jsonb;
  k text;
  v jsonb;
begin
  -- Manager/service-role changes (approval, unlock, maintenance) must not
  -- create employee-edit notifications.
  if auth.uid() is null or auth.uid() <> new.user_id then
    return new;
  end if;

  select * into proof
  from public.overtime_evidence
  where job_id = new.id
  order by created_at desc
  limit 1;

  if proof.id is null then
    return new;
  end if;

  -- Field-level diff of the correction (workflow-only "status" excluded).
  if new.job_date is distinct from old.job_date then
    diff := diff || jsonb_build_object('job_date', jsonb_build_object('from', to_jsonb(old.job_date), 'to', to_jsonb(new.job_date)));
  end if;
  if new.ot is distinct from old.ot then
    diff := diff || jsonb_build_object('ot', jsonb_build_object('from', to_jsonb(old.ot), 'to', to_jsonb(new.ot)));
  end if;
  if new.depart is distinct from old.depart then
    diff := diff || jsonb_build_object('depart', jsonb_build_object('from', to_jsonb(old.depart::text), 'to', to_jsonb(new.depart::text)));
  end if;
  if new.arrivee is distinct from old.arrivee then
    diff := diff || jsonb_build_object('arrivee', jsonb_build_object('from', to_jsonb(old.arrivee::text), 'to', to_jsonb(new.arrivee::text)));
  end if;
  if new.fin is distinct from old.fin then
    diff := diff || jsonb_build_object('fin', jsonb_build_object('from', to_jsonb(old.fin::text), 'to', to_jsonb(new.fin::text)));
  end if;
  if new.return_time_minutes is distinct from old.return_time_minutes then
    diff := diff || jsonb_build_object('return_time_minutes', jsonb_build_object('from', to_jsonb(old.return_time_minutes), 'to', to_jsonb(new.return_time_minutes)));
  end if;
  if new.km_total is distinct from old.km_total then
    diff := diff || jsonb_build_object('km_total', jsonb_build_object('from', to_jsonb(old.km_total), 'to', to_jsonb(new.km_total)));
  end if;
  if new.km_retour is distinct from old.km_retour then
    diff := diff || jsonb_build_object('km_retour', jsonb_build_object('from', to_jsonb(old.km_retour), 'to', to_jsonb(new.km_retour)));
  end if;

  -- Nothing a manager cares about changed (e.g. only workflow status).
  if diff = '{}'::jsonb then
    return new;
  end if;

  -- Collapse into a single unacknowledged notification per job.
  select id, coalesce(changes, '{}'::jsonb)
    into existing_id, existing_changes
  from public.manager_notifications mn
  where mn.job_id = new.id
    and mn.type = 'overtime_job_edited'
    and not exists (
      select 1 from public.manager_notification_reads r where r.notification_id = mn.id
    )
  order by mn.created_at desc
  limit 1;

  if existing_id is not null then
    merged := existing_changes;
    for k, v in select key, value from jsonb_each(diff) loop
      if merged ? k then
        merged := jsonb_set(merged, array[k, 'to'], v -> 'to');
      else
        merged := merged || jsonb_build_object(k, v);
      end if;
    end loop;
    -- Drop fields that ended back at their original value.
    for k, v in select key, value from jsonb_each(merged) loop
      if (v -> 'from') is not distinct from (v -> 'to') then
        merged := merged - k;
      end if;
    end loop;

    if merged = '{}'::jsonb then
      delete from public.manager_notifications where id = existing_id;
    else
      update public.manager_notifications
        set changes = merged,
            evidence_id = proof.id,
            daily_minutes = proof.daily_minutes,
            created_at = now()
      where id = existing_id;
    end if;
  else
    insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes, changes)
    values ('overtime_job_edited', new.user_id, new.id, proof.id, proof.daily_minutes, diff);
  end if;

  return new;
end;
$$;

revoke all on function public.notify_overtime_job_edit() from public, anon, authenticated;
