-- 0096: Communications — several pictures and PDFs per message (V2.4.143).
--
-- A broadcast had at most one picture (image_path). attachments lists every file, in order:
--   [{ "path": "<uuid>.jpg" | "<uuid>.pdf", "kind": "image" | "pdf", "name": "<PDF file name>" }]
-- image_path stays filled with the first picture so an app not yet updated on a phone still shows it.

alter table public.manager_broadcasts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.manager_broadcasts
  drop constraint if exists manager_broadcasts_attachments_shape;
alter table public.manager_broadcasts
  add constraint manager_broadcasts_attachments_shape
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

comment on column public.manager_broadcasts.attachments is
  'Pictures and PDFs of the message, in order: [{path, kind: image|pdf, name}] in the broadcast-images bucket.';

-- Messages sent before: their single picture becomes the first attachment.
update public.manager_broadcasts
set attachments = jsonb_build_array(jsonb_build_object('path', image_path, 'kind', 'image', 'name', ''))
where image_path is not null and attachments = '[]'::jsonb;

-- The bucket accepts the compressed pictures and PDFs only, 10 MB per file (the app checks it too).
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    file_size_limit = 10485760
where id = 'broadcast-images';
