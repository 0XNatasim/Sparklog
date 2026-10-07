// Pure helpers behind the manager Inventory page: merge the rows read from the three
// overlapping screenshots into one list, and summarize an employee's day.

// Screenshots overlap (the last rows of one are the first of the next), so the same code can
// come from several slots. Keep one row per code: the latest capture's quantity, the longest name.
export function mergeInventoryItems(rows) {
  const byCode = new Map();
  for (const row of rows || []) {
    const current = byCode.get(row.code);
    if (!current) {
      byCode.set(row.code, { ...row });
      continue;
    }
    const name = String(row.name || "").length >= String(current.name || "").length ? row.name : current.name;
    byCode.set(row.code, Number(row.slot) >= Number(current.slot) ? { ...row, name } : { ...current, name });
  }
  return [...byCode.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "fr-CA") || a.code.localeCompare(b.code));
}

// A reading normally finishes within seconds. A screenshot still "pending" long after it was sent
// (sent before the reading existed, or the request was lost) must not show "Reading…" forever.
export const INVENTORY_READING_TIMEOUT_MS = 3 * 60 * 1000;

// `requestedAt` is the time a manager last asked for a re-reading of this screenshot (ms).
export function effectiveOcrStatus(shot, now = Date.now(), requestedAt = 0) {
  if (shot.ocr_status !== "pending") return shot.ocr_status;
  const since = Math.max(Date.parse(shot.created_at) || 0, requestedAt || 0);
  return now - since > INVENTORY_READING_TIMEOUT_MS ? "failed" : "pending";
}

// state: missing (no capture) · partial (<3 captures) · reading (OCR running) · ok (list matches
// the app's own total) · review (list read but unverified) · photos (nothing readable).
export const INVENTORY_STATE_ORDER = ["missing", "partial", "photos", "review", "reading", "ok"];

export function summarizeInventoryDay(shots, rows, slotCount = 3) {
  const items = mergeInventoryItems(rows);
  const expected = Math.max(0, ...(shots || []).map((shot) => Number(shot.list_total) || 0)) || null;
  let state;
  if (!shots?.length) state = "missing";
  else if (shots.length < slotCount) state = "partial";
  else if (shots.some((shot) => shot.ocr_status === "pending")) state = "reading";
  else if (!items.length) state = "photos";
  else if (expected !== null && items.length === expected && shots.every((shot) => shot.ocr_status === "processed")) state = "ok";
  else state = "review";
  return { state, items, count: items.length, expected, captures: shots?.length || 0 };
}
