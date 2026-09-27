-- 0028: let any owner (employee OR manager) upload evidence to their OWN folder.
--
-- The overtime-evidence and parking-receipts storage buckets each had an INSERT policy
-- gated by is_active_employee() (role = 'employee'). A manager who also works in the
-- field (e.g. Simon B.) therefore could not upload their own overtime screenshot or
-- parking receipt: the storage insert was rejected by RLS, surfacing in the app as
-- "The overtime screenshot upload failed. Please retry." — a failure no retry could fix.
--
-- Mirror the jobs-delete fix (0027): make upload ownership-based, not role-based. Any
-- non-paused account may upload, but ONLY into its own user-id folder
-- (storage.foldername(name)[1] = auth.uid()), so nobody can write into another person's
-- folder. Managers still read all evidence via the existing "manager read" policies;
-- paused accounts remain contained.

drop policy if exists "overtime storage: employee upload" on storage.objects;

create policy "overtime storage: owner upload"
on storage.objects
for insert
with check (
  bucket_id = 'overtime-evidence'
  and public.is_not_paused()
  and (storage.foldername(name))[1] = (auth.uid())::text
);

drop policy if exists "parking storage: employee upload" on storage.objects;

create policy "parking storage: owner upload"
on storage.objects
for insert
with check (
  bucket_id = 'parking-receipts'
  and public.is_not_paused()
  and (storage.foldername(name))[1] = (auth.uid())::text
);
