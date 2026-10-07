// End-of-shift Field Service inventory: three screenshots per employee per work day.
// Keep INVENTORY_REQUIRED_FROM in sync with the 0071 migration (the database enforces it).
export const INVENTORY_SLOTS = [1, 2, 3];
export const INVENTORY_BUCKET = "inventory-screenshots";
export const INVENTORY_REQUIRED_FROM = "2026-10-08";

export function inventoryRequiredFor(jobDate, { officeEmployee = false } = {}) {
  return !officeEmployee && Boolean(jobDate) && String(jobDate) >= INVENTORY_REQUIRED_FROM;
}

export function inventoryStoragePath(userId, jobDate, slot, objectId) {
  return `${userId}/${jobDate}/inventory-${slot}-${objectId}.jpg`;
}

export function missingInventorySlots(rows) {
  const present = new Set((rows || []).map((row) => Number(row.slot)));
  return INVENTORY_SLOTS.filter((slot) => !present.has(slot));
}
