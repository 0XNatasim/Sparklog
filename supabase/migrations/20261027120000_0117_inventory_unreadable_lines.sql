-- 0117: unreadable inventory lines and the « complément » screenshot (V2.4.188).
--
-- When a Field Service row is cut at the edge of a screenshot, the reading sees its code (EQ000041…)
-- but no quantity. Until now the row was dropped and the manager only saw « 16 appareils sur 17 ».
-- Now the row is kept with a NULL quantity (« illisible »), so the app can name it, and the employee is
-- asked to send one more screenshot (slot 5, « complément ») showing that row in full.
--
-- Slots: 1-3 equipment list · 4 « Produits défectueux » (0097) · 5 complément (list rows, like 1-3).
-- Only slots 1 to 3 satisfy the submission gate (0092 / 0097): the complément alone never does.

-- 1. A row read without its quantity keeps a NULL quantity (the bounds of 0104 still apply otherwise).
alter table public.inventory_items alter column quantity drop not null;

-- 2. Slot 5 (complément) for screenshots and the rows read from them.
alter table public.inventory_screenshots drop constraint if exists inventory_screenshots_slot_check;
alter table public.inventory_screenshots
  add constraint inventory_screenshots_slot_check check (slot between 1 and 5);

alter table public.inventory_items drop constraint if exists inventory_items_slot_check;
alter table public.inventory_items
  add constraint inventory_items_slot_check check (slot between 1 and 5);
