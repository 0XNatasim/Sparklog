// End-of-shift Field Service inventory: one to three screenshots per employee per work day,
// as many as the phone needs to show the whole list (what counts is the list's line count).
// Keep INVENTORY_REQUIRED_FROM in sync with the 0071 migration (the database enforces it).
export const INVENTORY_SLOTS = [1, 2, 3];
// After the list, the employee is asked whether Field Service shows « Produits défectueux »; if so,
// a picture of that section goes in slot 4 (0097). Only rows under that title are counted there.
export const DEFECTIVE_SLOT = 4;
export const INVENTORY_PHOTO_SLOTS = [...INVENTORY_SLOTS, DEFECTIVE_SLOT];
export const INVENTORY_BUCKET = "inventory-screenshots";
export const INVENTORY_REQUIRED_FROM = "2026-10-08";

export function inventoryRequiredFor(jobDate, { officeEmployee = false } = {}) {
  return !officeEmployee && Boolean(jobDate) && String(jobDate) >= INVENTORY_REQUIRED_FROM;
}

export function inventoryStoragePath(userId, jobDate, slot, objectId) {
  return `${userId}/${jobDate}/inventory-${slot}-${objectId}.jpg`;
}

// The day can be submitted once at least one inventory screenshot is saved (the 0092 gate, slots
// 1 to 3 since 0097: the defective-products picture alone does not count).
export function inventoryCaptured(rows) {
  return (rows || []).some((row) => INVENTORY_SLOTS.includes(Number(row.slot)));
}

export function defectiveCaptured(rows) {
  return (rows || []).some((row) => Number(row.slot) === DEFECTIVE_SLOT);
}

// End-of-shift inventory step: « Continuer » needs at least one list screenshot and an answer to
// « Produits défectueux ? » — « Non », or « Oui » with the defective-products picture sent.
export function inventoryStepComplete(rows, defectiveAnswer) {
  if (!inventoryCaptured(rows)) return false;
  if (defectiveAnswer === "no") return true;
  return defectiveAnswer === "yes" && defectiveCaptured(rows);
}

export function missingInventorySlots(rows) {
  const present = new Set((rows || []).map((row) => Number(row.slot)));
  return INVENTORY_SLOTS.filter((slot) => !present.has(slot));
}

// Badge shown beside each day of the employee's History: "done" (inventory sent), "missing"
// (a required day without any capture), or null (nothing to show: option off, or a day from
// before the rollout with no captures).
export function inventoryDayBadge(jobDate, captureCount, enabled) {
  if (captureCount > 0) return "done";
  if (!enabled) return null;
  return inventoryRequiredFor(jobDate) ? "missing" : null;
}

// Several screenshots picked at once: oldest first (screenshots are taken top to bottom of the
// list; equal or unknown times keep the picker's order). A full set (3 or more files) fills slots
// 1 to 3 in that order, replacing what was there; fewer files fill the missing slots in order.
// Files beyond the available slots are returned in `extra`, never guessed into a filled slot.
export function planInventoryUploads(files, rows) {
  const ordered = [...(files || [])]
    .map((file, index) => ({ file, index }))
    .sort((a, b) => (Number(a.file?.lastModified) || 0) - (Number(b.file?.lastModified) || 0) || a.index - b.index)
    .map(({ file }) => file);
  const targets = ordered.length >= INVENTORY_SLOTS.length ? INVENTORY_SLOTS : missingInventorySlots(rows);
  const uploads = targets.slice(0, ordered.length).map((slot, index) => ({ slot, file: ordered[index] }));
  return { uploads, extra: ordered.length - uploads.length };
}

// People a manager can ask to send the inventory (Inventaire › « Qui fait l'inventaire ») : active
// accounts that work in the field (not office « admin » employees, who never get the step), by name.
export function inventoryCandidates(people) {
  return (people || [])
    .filter((p) => p && !p.is_paused && p.role !== "admin")
    .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "fr-CA"));
}
