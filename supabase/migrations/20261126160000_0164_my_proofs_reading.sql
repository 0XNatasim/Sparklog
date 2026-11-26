-- 0164 — The employee sees the reading of their own overtime proofs.
-- my_overtime_proofs(date) (0144) only returned id / job / path / date. To tell the employee « conform, submit again » right after
-- they replaced a returned proof, it also returns the state of the reading and the three values read (their own data: the
-- table itself stays manager-only). Nothing else about the queue (attempts, next try) is exposed.
-- The return type changes, so the function is dropped first; the grants are given again.
drop function if exists public.my_overtime_proofs(date);
create function public.my_overtime_proofs(p_date date)
returns table (
  id uuid, job_id uuid, storage_path text, created_at timestamptz,
  ocr_status text, form_kind text, proof_ot text, proof_client_minutes integer, proof_return_minutes integer, proof_read_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select e.id, e.job_id, e.storage_path, e.created_at,
         e.ocr_status, e.form_kind, e.proof_ot, e.proof_client_minutes, e.proof_return_minutes, e.proof_read_at
  from public.overtime_evidence e
  where e.user_id = auth.uid() and e.job_date = p_date
  order by e.created_at;
$$;
revoke all on function public.my_overtime_proofs(date) from public, anon;
grant execute on function public.my_overtime_proofs(date) to authenticated;
