// Parking receipts: one claim per job (one amount, one review), with as many parcomètre pictures as
// the employee paid (migration 0095): the first in `storage_path`, the others in `extra_storage_paths`.
// Keep MAX_PARKING_PICTURES in sync with the 0095 check constraint (1 + 9 extras).
export const PARKING_BUCKET = "parking-receipts";
export const MAX_PARKING_PICTURES = 10;

// Every picture of one receipt row, in the order the employee took them.
export function parkingReceiptPaths(receipt) {
  if (!receipt) return [];
  const extras = Array.isArray(receipt.extra_storage_paths) ? receipt.extra_storage_paths : [];
  return [receipt.storage_path, ...extras].filter(Boolean);
}

export function parkingStoragePath(userId, jobDate, objectId) {
  return `${userId}/${jobDate}/${objectId}.jpg`;
}

// Pictures picked at once: oldest first (equal or unknown times keep the picker's order).
export function orderPickedFiles(files) {
  return [...(files || [])]
    .map((file, index) => ({ file, index }))
    .sort((a, b) => (Number(a.file?.lastModified) || 0) - (Number(b.file?.lastModified) || 0) || a.index - b.index)
    .map(({ file }) => file);
}

// Paths to store after a save. "add" keeps the pictures already saved and appends the new ones;
// "replace" keeps only the new ones. Returns null when the total exceeds MAX_PARKING_PICTURES.
export function mergeParkingPaths(existingPaths, newPaths, mode = "add") {
  const kept = mode === "add" ? (existingPaths || []).filter(Boolean) : [];
  const all = [...kept, ...(newPaths || []).filter(Boolean)];
  if (all.length === 0 || all.length > MAX_PARKING_PICTURES) return null;
  return { storage_path: all[0], extra_storage_paths: all.slice(1) };
}
