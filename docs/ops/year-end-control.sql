-- Year-end control (V2.4.227) — READ ONLY, counts only (no name, NAS or amount). Run in the Supabase SQL editor
-- in early December, then again before the first pay of January. Each line says what to do when it is not 0.
select 'active_employees' as item, count(*) as n, 'info' as todo
  from public.profiles where not coalesce(is_paused, false)
union all
select 'active_without_nas', count(*), 'Enter the NAS (owner only, Employés › fiche) — needed for Relevé 1, RE and the CCQ monthly report'
  from public.profiles p where not coalesce(p.is_paused, false)
   and not exists (select 1 from public.employee_sensitive s where s.user_id = p.id and s.nas_secret_id is not null)
union all
select 'active_without_hire_date', count(*), 'Fill start_date (Employés › fiche › Emploi) — boxes 10/11 of the ROE'
  from public.profiles p where not coalesce(p.is_paused, false) and p.start_date is null
union all
select 'active_without_td1_tp1015_3', count(*), 'Enter TD1 / TP-1015.3 amounts (Employés › fiche › Impôts); empty = basic personal amount only'
  from public.profiles p where not coalesce(p.is_paused, false)
   and not exists (select 1 from public.employee_tax_profiles t where t.user_id = p.id
                   and (t.td1_claim_amount is not null or t.tp1015_3_credits is not null))
union all
select 'rate_set_next_year_missing', case when exists (select 1 from public.statutory_rate_sets
                                           where tax_year = extract(year from now())::int + 1) then 0 else 1 end,
       'Configuration › Barèmes annuels: enter next year''s RRQ, AE, RQAP, tax brackets, FSS (see NOOB.md)'
union all
select 'submitted_jobs_not_approved', count(*), 'Approve (À traiter), then Paie de la semaine › Comptabiliser, one week at a time'
  from public.jobs where status = 'submitted'
union all
select 'approved_not_exported', count(*), 'Re-approve or check the Google script (Santé du système shows it too)'
  from public.jobs where status = 'approved' and exported_to_sheet = false
union all
select 'weeks_in_ledger', count(distinct period_end), 'info: weeks already posted by Sparklog'
  from public.payroll_period_ledger
order by 1;
