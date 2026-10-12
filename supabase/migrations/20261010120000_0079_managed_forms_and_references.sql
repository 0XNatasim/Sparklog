-- 0079: forms and profile references are managed in the app (Configuration), not in code.
--
-- Forms (links shown in each employee's Profile): employee_forms gains the name (FR/EN),
-- link and "employee specific" flag that used to live in src/lib/forms.js, so a manager-tier
-- user can create, edit and delete them. Existing rows keep their `enabled` flag and their
-- employee_form_access rows (form_id is unchanged).
--
-- References (Profile › Références rapides / Contacts): profile_references holds an ordered
-- list of content blocks (heading, formatted text, callout, link, file, image, contact).
-- Employees read the published ones; only manager-tier roles write. Files and images live in
-- the private `reference-files` bucket (read by any signed-in user, written by managers).
-- A trigger validates block shape and URL schemes so a stored `javascript:` link can never
-- reach an employee's browser, whatever client wrote it.

-- ---------------------------------------------------------------------------
-- Forms
-- ---------------------------------------------------------------------------
alter table public.employee_forms
  add column if not exists name_fr text,
  add column if not exists name_en text,
  add column if not exists url text,
  add column if not exists employee_specific boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.employee_forms alter column form_id set default gen_random_uuid()::text;

alter table public.employee_forms drop constraint if exists employee_forms_content_check;
alter table public.employee_forms add constraint employee_forms_content_check check (
  (name_fr is null or char_length(btrim(name_fr)) between 1 and 200)
  and (name_en is null or char_length(btrim(name_en)) between 1 and 200)
  and (url is null or (url ~* '^https?://[^[:space:]]+$' and char_length(url) <= 2000))
);

drop policy if exists "employee_forms: manager insert" on public.employee_forms;
create policy "employee_forms: manager insert" on public.employee_forms
  for insert to authenticated with check ((select public.get_my_role()) = 'manager');
drop policy if exists "employee_forms: manager delete" on public.employee_forms;
create policy "employee_forms: manager delete" on public.employee_forms
  for delete to authenticated using ((select public.get_my_role()) = 'manager');

drop trigger if exists employee_forms_set_updated_at on public.employee_forms;
create trigger employee_forms_set_updated_at before update on public.employee_forms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------
create table if not exists public.profile_references (
  id uuid primary key default gen_random_uuid(),
  section text not null default 'quick' check (section in ('quick', 'contacts')),
  title text not null,
  description text,
  blocks jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_references_order_idx
  on public.profile_references (section, sort_order, created_at);

alter table public.profile_references enable row level security;

drop policy if exists "profile references: read published" on public.profile_references;
create policy "profile references: read published" on public.profile_references
  for select to authenticated
  using (published or (select public.get_my_role()) = 'manager');
drop policy if exists "profile references: manager insert" on public.profile_references;
create policy "profile references: manager insert" on public.profile_references
  for insert to authenticated with check ((select public.get_my_role()) = 'manager');
drop policy if exists "profile references: manager update" on public.profile_references;
create policy "profile references: manager update" on public.profile_references
  for update to authenticated
  using ((select public.get_my_role()) = 'manager')
  with check ((select public.get_my_role()) = 'manager');
drop policy if exists "profile references: manager delete" on public.profile_references;
create policy "profile references: manager delete" on public.profile_references
  for delete to authenticated using ((select public.get_my_role()) = 'manager');

drop trigger if exists profile_references_set_updated_at on public.profile_references;
create trigger profile_references_set_updated_at before update on public.profile_references
  for each row execute function public.set_updated_at();

-- Not SECURITY DEFINER: it only inspects the row being written.
create or replace function public.validate_profile_reference()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  block jsonb;
  kind text;
  link text;
  file_path text;
begin
  new.title := btrim(coalesce(new.title, ''));
  if char_length(new.title) not between 1 and 200 then
    raise exception using errcode = '23514', message = 'reference_title_invalid';
  end if;
  if new.description is not null and char_length(new.description) > 500 then
    raise exception using errcode = '23514', message = 'reference_description_too_long';
  end if;
  if jsonb_typeof(new.blocks) is distinct from 'array'
     or jsonb_array_length(new.blocks) > 100
     or octet_length(new.blocks::text) > 200000 then
    raise exception using errcode = '23514', message = 'reference_blocks_invalid';
  end if;

  for block in select value from jsonb_array_elements(new.blocks) loop
    kind := block ->> 'type';
    if kind is null or kind not in ('heading', 'text', 'callout', 'link', 'file', 'image', 'contact') then
      raise exception using errcode = '23514', message = 'reference_block_type_invalid';
    end if;
    if kind = 'link' then
      link := btrim(coalesce(block ->> 'url', ''));
      if link !~* '^(https?://|tel:|mailto:)[^[:space:]]+$' or char_length(link) > 2000 then
        raise exception using errcode = '23514', message = 'reference_url_invalid';
      end if;
    elsif kind in ('file', 'image') then
      file_path := coalesce(block ->> 'path', '');
      if file_path = '' or file_path like '/%' or file_path like '%..%' or char_length(file_path) > 300 then
        raise exception using errcode = '23514', message = 'reference_file_path_invalid';
      end if;
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.validate_profile_reference() from public, anon, authenticated;

drop trigger if exists profile_references_validate on public.profile_references;
create trigger profile_references_validate before insert or update on public.profile_references
  for each row execute function public.validate_profile_reference();

-- ---------------------------------------------------------------------------
-- Files and images attached to references
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reference-files', 'reference-files', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "reference files: authenticated read" on storage.objects;
create policy "reference files: authenticated read" on storage.objects for select to authenticated
  using (bucket_id = 'reference-files');
drop policy if exists "reference files: manager upload" on storage.objects;
create policy "reference files: manager upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'reference-files' and (select public.get_my_role()) = 'manager');
drop policy if exists "reference files: manager update" on storage.objects;
create policy "reference files: manager update" on storage.objects for update to authenticated
  using (bucket_id = 'reference-files' and (select public.get_my_role()) = 'manager')
  with check (bucket_id = 'reference-files' and (select public.get_my_role()) = 'manager');
drop policy if exists "reference files: manager delete" on storage.objects;
create policy "reference files: manager delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reference-files' and (select public.get_my_role()) = 'manager');

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- Seed: the 8 forms that were hard-coded in src/lib/forms.js. `enabled` is never touched.
insert into public.employee_forms (form_id, enabled, name_fr, name_en, url, employee_specific, sort_order) values
  ('overtime', false, 'Temps supp', 'Overtime', 'https://forms.office.com/Pages/ResponsePage.aspx?id=8BAK9O5QgEiaN24d1Kwv83RO3QTV6M1JhNHDNpxKlTtUMkdSQUJGTDRQTFNYQUQxMUE1NjNSSVU1RC4u', false, 10),
  ('absence', false, 'Absence', 'Absence', 'https://forms.office.com/pages/responsepage.aspx?id=8BAK9O5QgEiaN24d1Kwv83RO3QTV6M1JhNHDNpxKlTtUNkdWNlM5UkIxM1NXNFNLOUJPUVpDVlNUUS4u&route=shorturl', false, 20),
  ('audit', false, 'Audit', 'Audit', 'https://forms.office.com/pages/responsepage.aspx?id=sqvQYoBd-ket04-x9iYHwJuHPRcS9NdEl4fNiq2Br8NUN0hDR1I5UzRXNllRTEdXOFJOUFdVUUQzVy4u&route=shorturl', false, 30),
  ('equipment-transfer', false, 'Transfert de matériel entre électricien', 'Equipment transfer between electricians', 'https://forms.office.com/Pages/ResponsePage.aspx?id=sqvQYoBd-ket04-x9iYHwGXeCbSSf41AhgBlbAy17W1UNlBDQURBQlNUQzRHN08xVFFUSlA1OVZXTiQlQCN0PWcu', false, 40),
  ('britton-inventory', false, 'Inventaire entrepôt Britton', 'Britton warehouse inventory', 'https://forms.office.com/pages/responsepage.aspx?id=sqvQYoBd-ket04-x9iYHwGXeCbSSf41AhgBlbAy17W1UMVZHMlg0MDBKSkI4Q0VSMUFCT0VYUzNPMCQlQCN0PWcu&route=shorturl', false, 50),
  ('equipment-pickup', false, 'Prise de matériel', 'Equipment pickup', 'https://forms.office.com/Pages/ResponsePage.aspx?id=sqvQYoBd-ket04-x9iYHwJuHPRcS9NdEl4fNiq2Br8NUMUIwM0w0TlE3UkJKUTU1N1laWVhLN0JEMS4u', false, 60),
  ('subcontractor-inventory', false, 'Inventaire sous-contractant', 'Subcontractor inventory', 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=sqvQYoBd-ket04-x9iYHwGXeCbSSf41AhgBlbAy17W1UQTlSN0ZKMlRVTEw5OVFXOFUwRk5WNFNBMiQlQCN0PWcu', true, 70),
  ('security-meeting', false, 'Réunion sécurité', 'Security meeting', 'https://teams.microsoft.com/meet/259205679338882?p=VE1MH2hmeR0p0B1Hsy', false, 80)
on conflict (form_id) do update set
  name_fr = coalesce(public.employee_forms.name_fr, excluded.name_fr),
  name_en = coalesce(public.employee_forms.name_en, excluded.name_en),
  url = coalesce(public.employee_forms.url, excluded.url),
  employee_specific = excluded.employee_specific,
  sort_order = excluded.sort_order;

-- Seed: the references that were hard-coded in Profile.jsx (Références rapides + Contacts).
insert into public.profile_references (section, title, description, blocks, sort_order)
select * from (values
  ('quick', 'Status de réservation', 'Rappel de la bonne utilisation des statuts lors de la fermeture des OT.', $json$[{"type": "text", "text": "Il existe plusieurs statuts de réservation lors de la fermeture des OT. Ce message est un rappel de la bonne utilisation de chacun d'entre eux."}, {"type": "heading", "text": "Annulé – Refus d'installer"}, {"type": "text", "text": "À utiliser lorsque le client ne souhaite plus la solution Hilo, change d'idée ou refuse définitivement l'installation."}, {"type": "heading", "text": "Annulé – Client absent"}, {"type": "text", "text": "Appelez le client au numéro inscrit au dossier en composant **#31#** avant le numéro."}, {"type": "text", "text": "**Si le client répond :**\n- Peut-il être présent dans les 15 prochaines minutes?\n- **Oui :** attendez sur place et procédez à l'installation.\n- **Non :** mettez le statut « Annulé – Client absent » et informez la répartition."}, {"type": "text", "text": "**Si le client ne répond pas :**\n- Communiquez avec la répartition afin qu'elle tente également de joindre le client.\n- Après 15 minutes, mettez le statut « Annulé – Client absent » et informez la répartition.\n- Ajoutez une photo de la porte du client dans la section « Notes rapides » de l'OT.\n- Inscrivez toute information pertinente pouvant expliquer la situation."}, {"type": "callout", "tone": "warning", "text": "**Important :** Si le client n'est pas prêt pour l'installation, mais souhaite qu'elle soit effectuée à une date ultérieure, utilisez également le statut « Annulé – Client absent » et expliquez clairement la situation dans les notes."}, {"type": "heading", "text": "En attente de thermostats"}, {"type": "callout", "tone": "danger", "text": "Ce statut ne doit jamais être utilisé."}, {"type": "heading", "text": "Non admissible"}, {"type": "text", "text": "Utilisez ce statut uniquement dans les situations suivantes :\n- Absence de réseau Internet.\n- Le client ne possède pas de téléphone intelligent ou de tablette compatible.\n- Installation impossible pour une raison technique ou autre."}, {"type": "text", "text": "Dans tous les cas de non-admissibilité, veuillez inscrire dans les notes la raison précise pour laquelle l'installation n'a pas pu être réalisée. Ces informations nous permettent de bien comprendre la situation, de l'expliquer au client au besoin et d'éviter des communications inutiles."}, {"type": "text", "text": "**Merci à tous de votre collaboration et de votre vigilance dans l'utilisation des statuts.**"}]$json$::jsonb, 10),
  ('quick', 'Calypso V1', 'Information importante concernant les appareils Calypso V1.', $json$[{"type": "callout", "tone": "danger", "text": "**Svp ne plus installer de Calypso V1.**"}, {"type": "text", "text": "S'il vous en reste en votre possession, veuillez les rapporter à votre entrepôt."}, {"type": "text", "text": "Nous sommes présentement en train de faire des tests sur les V1."}]$json$::jsonb, 20),
  ('quick', 'Distance entre thermostats', 'Distance minimale à respecter entre 2 thermostats.', $json$[{"type": "text", "text": "Au moment de faire votre installation, nos manufacturiers recommandent une distance minimale à respecter entre 2 thermostats."}, {"type": "callout", "tone": "info", "text": "**Distance minimale entre 2 thermostats**\n6 pouces (15,24 cm) de dégagement de chaque côté (à gauche et à droite)."}, {"type": "callout", "tone": "warning", "text": "**Exception — plancher chauffant**\nUn thermostat de plancher chauffant n'est pas considéré dans cette distance uniquement s'il possède absolument une sonde de plancher."}, {"type": "heading", "text": "Superposition (un au-dessus de l'autre)"}, {"type": "text", "text": "Il est impossible de garantir le fonctionnement de thermostats positionnés un au-dessus de l'autre, puisque la chaleur dégagée par celui du dessous viendra biaiser la température de celui du haut."}, {"type": "heading", "text": "Si les règles ne peuvent pas être respectées"}, {"type": "text", "text": "Il est de votre responsabilité d'expliquer la situation au client et d'éviter ce genre d'installation pour tous les thermostats en cause, et de laisser ces installations telles quelles."}, {"type": "text", "text": "Le client a toujours la possibilité de faire corriger la situation par un électricien certifié et de faire une commande supplémentaire dans le futur."}]$json$::jsonb, 30),
  ('quick', 'Température d''entreposage', 'Choc thermique et condensation en période de grand froid.', $json$[{"type": "text", "text": "La grande différence de température entre les appareils qui arrivent de l'extérieur en périodes de grands froids et la température ambiante chez le client peut créer un problème à l'installation des thermostats et des contrôleurs de chauffe-eau."}, {"type": "text", "text": "Le choc thermique entre les températures très froides à l'extérieur et autour de +20 °C à l'intérieur risque de causer de la condensation sous la forme d'une couche d'humidité au niveau des composantes électroniques. Celle-ci génère un pont entre les points de soudure, ce qui peut entraîner des courts-circuits qui endommagent les appareils lorsqu'on rétablit le courant."}, {"type": "heading", "text": "Observations"}, {"type": "text", "text": "Les cas observés ont démontré des tâches noires et des étincelles apparentes. Les équipements ont dû être remplacés."}, {"type": "heading", "text": "Comportements souhaités"}, {"type": "text", "text": "- Ne pas laisser les appareils à l'extérieur, même dans le coffre d'une voiture, durant la période hivernale.\n- Laisser les appareils atteindre le plus près possible de la température de la pièce avant de les installer."}, {"type": "heading", "text": "Rappels"}, {"type": "text", "text": "**Température d'entreposage minimum**\n- −40 °C à 50 °C pour tous les appareils.\n\n**Température d'utilisation**\n- −20 °C à 50 °C pour les thermostats.\n- 0 °C à 40 °C pour les contrôleurs de chauffe-eau."}]$json$::jsonb, 40),
  ('quick', 'Thermostat plancher chauffant — TH1300ZB (manuel)', null::text, $json$[{"type": "link", "label": "Thermostat plancher chauffant — TH1300ZB (manuel)", "url": "https://support.sinopetech.com/wp-content/uploads/2026/04/660-0735-0022-E_TH1300ZB-ENG-Avec-GT130_web.pdf"}]$json$::jsonb, 50),
  ('quick', 'Calypso V2 — RM3510WF (guide d''installation)', null::text, $json$[{"type": "link", "label": "Calypso V2 — RM3510WF (guide d'installation)", "url": "https://support.sinopetech.com/wp-content/uploads/2026/01/660-0339-0000-29012026-Guide-dinstallation-RM3510WF-FR.pdf"}]$json$::jsonb, 60),
  ('contacts', 'Messier Connexion inc.', null::text, $json$[{"type": "contact", "name": "Karine Messier", "phone": "514-799-8879", "email": "messierconnexion@gmail.com"}, {"type": "contact", "name": "Simon Bellerive", "phone": "438-392-4672", "email": "simon1984bjeux@gmail.com"}]$json$::jsonb, 70),
  ('contacts', 'HILO — Répartition', null::text, $json$[{"type": "contact", "name": "", "phone": "438-289-4456", "note": "Choix caché : composez le 7."}]$json$::jsonb, 80),
  ('contacts', 'Britton', null::text, $json$[{"type": "contact", "name": "Olivier Dagenais", "role": "Contremaître", "phone": "438-828-7070", "email": "odagenais@britton.ca"}, {"type": "contact", "name": "Mélanie Noël-Richard", "role": "Contremaître", "phone": "514-799-0097", "email": "mrichard@britton.ca"}, {"type": "contact", "name": "Marc-Antoine Charette", "role": "Contremaître", "phone": "514-912-7847", "email": "mcharette@britton.ca"}, {"type": "contact", "name": "Yanni Chabot-Valin", "role": "Contremaître", "phone": "514-668-3736", "email": "yvalin@britton.ca"}]$json$::jsonb, 90),
  ('contacts', 'Support installation', null::text, $json$[{"type": "contact", "name": "François Belhumeur", "phone": "438-396-8405"}, {"type": "contact", "name": "Jonathan Charron", "phone": "438-402-1023"}]$json$::jsonb, 100)
) as seed(section, title, description, blocks, sort_order)
where not exists (select 1 from public.profile_references);
