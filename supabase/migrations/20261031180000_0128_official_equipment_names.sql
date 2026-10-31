-- 0128: official names of the Field Service equipment (V2.4.216).
--
-- The screenshot reading often stored a garbled or cut name (« E- Contrôleur… », « Module d'expansion pour pla »).
-- The name of each known code is now the official one (the same list lives in supabase/functions/_shared/equipment_names.js,
-- used by the reading and by the screens). This rewrites the names already stored: the written inventory lists and the
-- minimum ratios. An unknown code is left as it was.

with names(code, name) as (values
  ('EQ000031', 'Sonde pour CEE'),
  ('EQ000026', 'Contrôleur chauffe-eau Hilo'),
  ('EQ000008', 'Gradateur mural intelligent'),
  ('EQ000046', 'Sinope - 3000W'),
  ('EQ000047', 'Sinope - 4000W'),
  ('EQ000049', 'Calypso V1'),
  ('EQ000052', 'Calypso V2'),
  ('EQ000016', 'Thermostat intelligent Hilo 4000'),
  ('EQ000043', 'Ensemble chauffe-eau'),
  ('EQ000025', 'Interrupteur auxiliaire (3 voie)'),
  ('EQ000014', 'Interrupteur mural intelligent'),
  ('EQ000041', 'Module d''expansion pour plancher'),
  ('EQ000017', 'Passerelle Hilo'),
  ('EQ000015', 'Prise murale intelligente'),
  ('EQ000048', 'Sinopé Light (3 fils)'),
  ('EQ000050', 'Sonde - Calypso'),
  ('EQ000040', 'Thermostat Plancher intelligent Hilo')
)
update public.inventory_items i set name = n.name
from names n where upper(btrim(i.code)) = n.code and i.name is distinct from n.name;

with names(code, name) as (values
  ('EQ000031', 'Sonde pour CEE'),
  ('EQ000026', 'Contrôleur chauffe-eau Hilo'),
  ('EQ000008', 'Gradateur mural intelligent'),
  ('EQ000046', 'Sinope - 3000W'),
  ('EQ000047', 'Sinope - 4000W'),
  ('EQ000049', 'Calypso V1'),
  ('EQ000052', 'Calypso V2'),
  ('EQ000016', 'Thermostat intelligent Hilo 4000'),
  ('EQ000043', 'Ensemble chauffe-eau'),
  ('EQ000025', 'Interrupteur auxiliaire (3 voie)'),
  ('EQ000014', 'Interrupteur mural intelligent'),
  ('EQ000041', 'Module d''expansion pour plancher'),
  ('EQ000017', 'Passerelle Hilo'),
  ('EQ000015', 'Prise murale intelligente'),
  ('EQ000048', 'Sinopé Light (3 fils)'),
  ('EQ000050', 'Sonde - Calypso'),
  ('EQ000040', 'Thermostat Plancher intelligent Hilo')
)
update public.inventory_min_ratios r set name = n.name
from names n where upper(btrim(r.code)) = n.code and r.name is distinct from n.name;
