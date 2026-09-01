-- CCQ card is now captured for everyone (no capture setting). Simplify the
-- renewal reminder to a single 30-day notification for managers; the employee
-- re-upload pop-up (client-side) also returns 30 days before expiry.
create or replace function public.notify_ccq_renewals()
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
begin
  for r in
    select p.id,
           p.ccq_expiration_date,
           (p.ccq_expiration_date - current_date) as days_left,
           p.ccq_renewal_30_sent_for
    from public.profiles p
    where p.ccq_expiration_date is not null
  loop
    if r.days_left <= 30 and r.ccq_renewal_30_sent_for is distinct from r.ccq_expiration_date then
      insert into public.manager_notifications (type, employee_id, job_id, daily_minutes, changes)
      values ('ccq_renewal', r.id, null, 0,
              jsonb_build_object('ccq_expiration', r.ccq_expiration_date, 'days_left', r.days_left));
      update public.profiles set ccq_renewal_30_sent_for = r.ccq_expiration_date where id = r.id;
    end if;
  end loop;
end;
$$;
revoke all on function public.notify_ccq_renewals() from public, anon, authenticated;
