-- Enforce upload limits at Storage even when an old or forged client bypasses UI checks.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id in ('overtime-evidence', 'parking-receipts', 'meal-receipts');

-- Cleanup worker reads only objects old enough that an in-flight upload cannot be
-- mistaken for an orphan. The service role is the only API role allowed to execute it.
create or replace function public.find_orphaned_evidence_objects(
  p_older_than interval default interval '2 hours',
  p_limit integer default 500
)
returns table (bucket_id text, object_name text)
language sql security definer set search_path to 'public', 'storage' as $function$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('overtime-evidence', 'parking-receipts', 'meal-receipts')
    and o.created_at < now() - greatest(p_older_than, interval '1 hour')
    and (
      (o.bucket_id = 'overtime-evidence' and not exists (
        select 1 from public.overtime_evidence e where e.storage_path = o.name
      ))
      or (o.bucket_id = 'parking-receipts' and not exists (
        select 1 from public.parking_receipts p where p.storage_path = o.name
      ))
      or (o.bucket_id = 'meal-receipts' and not exists (
        select 1 from public.meal_claims m where m.storage_path = o.name
      ))
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$function$;

revoke all on function public.find_orphaned_evidence_objects(interval, integer) from public, anon, authenticated;
grant execute on function public.find_orphaned_evidence_objects(interval, integer) to service_role;

-- Raw OCR text is unnecessary after classification and may contain message metadata.
update public.overtime_evidence set ocr_text = null where ocr_text is not null;

