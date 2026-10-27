// Pure helpers behind the manager Inventory page: merge the rows read from the overlapping
// screenshots (one to three) into one list, and summarize an employee's day.
import { DEFECTIVE_SLOT } from "./inventory-screenshots";
import { isOffOn } from "./timeoff";

// Screenshots overlap (the last rows of one are the first of the next), so the same code can
// come from several slots. Keep one row per code: a row whose quantity was read wins over one read
// without it (quantity null, 0117: cut at the edge of a capture); otherwise the latest capture's
// quantity. The longest name is kept.
const knownQuantity = (row) => row.quantity !== null && row.quantity !== undefined;
export function mergeInventoryItems(rows) {
  const byCode = new Map();
  for (const row of rows || []) {
    const current = byCode.get(row.code);
    if (!current) {
      byCode.set(row.code, { ...row });
      continue;
    }
    const name = String(row.name || "").length >= String(current.name || "").length ? row.name : current.name;
    const takeRow = knownQuantity(row) !== knownQuantity(current) ? knownQuantity(row) : Number(row.slot) >= Number(current.slot);
    byCode.set(row.code, takeRow ? { ...row, name } : { ...current, name });
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

// Rows read under Field Service's « Produits défectueux » title (0097) are kept apart from the
// equipment list: they never count toward the list's "N de N" total. Older rows have no section.
export const isDefectiveRow = (row) => row?.section === "defective";

// state: missing (no capture) · reading (OCR running) · ok (list matches the app's own total, every
// quantity read) · review (list read but unverified, fewer lines than the total, or a line whose
// quantity could not be read) · photos (nothing readable).
// `unreadable`: the lines read without their quantity (0117); `missing`: how many lines of the app's
// total were not read at all (code unknown).
// The number of screenshots does not matter: two captures often show the whole list.
// Slots 1 to 3 and 5 (complément, 0117) are list screenshots; slot 4 is the defective-products picture.
export const INVENTORY_STATE_ORDER = ["missing", "photos", "review", "reading", "ok"];

export function summarizeInventoryDay(shots, rows) {
  const listShots = (shots || []).filter((shot) => Number(shot.slot) !== DEFECTIVE_SLOT);
  const items = mergeInventoryItems((rows || []).filter((row) => !isDefectiveRow(row)));
  const expected = Math.max(0, ...listShots.map((shot) => Number(shot.list_total) || 0)) || null;
  let state;
  if (!listShots.length) state = "missing";
  else if (listShots.some((shot) => shot.ocr_status === "pending")) state = "reading";
  else if (!items.length) state = "photos";
  const unreadable = items.filter((item) => !knownQuantity(item));
  // The list is complete when the merged readings match the total the app itself shows ("N de N")
  // and every line has its quantity (a line cut in one capture may be whole in another).
  if (!state) state = expected !== null && items.length === expected && !unreadable.length ? "ok" : "review";
  return {
    state, items, count: items.length, expected, captures: listShots.length,
    unreadable, missing: expected !== null ? Math.max(0, expected - items.length) : 0,
    defective: summarizeDefective(shots, rows),
  };
}

// Defective products of the day: rows read under « Produits défectueux » on any screenshot (the
// slot 4 picture, or a list screenshot that reached that title), merged by code.
// state: none (no picture, nothing read) · reading · photos (picture sent, nothing readable)
// · ok (matches the section's own "N de N") · review (read, but unverified or short).
export function summarizeDefective(shots, rows) {
  const items = mergeInventoryItems((rows || []).filter(isDefectiveRow));
  const picture = (shots || []).find((shot) => Number(shot.slot) === DEFECTIVE_SLOT) || null;
  const expected = Math.max(0, ...(shots || []).map((shot) => Number(shot.defective_total) || 0)) || null;
  let state;
  if (picture?.ocr_status === "pending") state = "reading";
  else if (items.length) state = expected !== null && items.length === expected ? "ok" : "review";
  else state = picture ? "photos" : "none";
  return { state, items, count: items.length, expected, picture: Boolean(picture) };
}

const round2 = (value) => Math.round(value * 100) / 100;

// Today's list next to an earlier day's. A code missing from a list counts as 0 only when that
// list is known to be complete (it matched the app's own total); otherwise its quantity, and the
// difference, stay unknown (null) rather than inventing a change. diff = today - previous.
export function compareInventory(todayItems, previousItems, { todayComplete = false, previousComplete = false } = {}) {
  const today = new Map((todayItems || []).map((item) => [item.code, item]));
  const previous = new Map((previousItems || []).map((item) => [item.code, item]));
  return [...new Set([...today.keys(), ...previous.keys()])]
    .map((code) => {
      const now = today.get(code);
      const before = previous.get(code);
      // A quantity that could not be read (null) stays unknown.
      const qty = (row, complete) => (row ? (knownQuantity(row) ? Number(row.quantity) : null) : (complete ? 0 : null));
      const todayQty = qty(now, todayComplete);
      const previousQty = qty(before, previousComplete);
      const name = String(now?.name || "").length >= String(before?.name || "").length ? now?.name : before?.name;
      return {
        code,
        name: name || code,
        today: todayQty,
        previous: previousQty,
        diff: todayQty !== null && previousQty !== null ? round2(todayQty - previousQty) : null,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr-CA") || a.code.localeCompare(b.code));
}

// Crew-wide inventory: each employee's merged list for the day, summed per equipment code.
// `holders` is how many employees have a quantity above 0. `unverified` names the employees whose
// list is missing, still being read, unreadable or not matched to the app's total, so the
// totals are never mistaken for complete when they are not.
export function sumCrewInventory(entries) {
  const byCode = new Map();
  const unverified = [];
  let counted = 0;
  for (const entry of entries || []) {
    if (entry.state !== "ok") unverified.push(entry.name);
    if (!entry.items?.length) continue;
    counted += 1;
    for (const item of entry.items) {
      const quantity = Number(item.quantity) || 0;
      const current = byCode.get(item.code) || { code: item.code, name: item.name, total: 0, holders: 0 };
      current.total = Math.round((current.total + quantity) * 100) / 100;
      if (quantity > 0) current.holders += 1;
      if (String(item.name || "").length > String(current.name || "").length) current.name = item.name;
      byCode.set(item.code, current);
    }
  }
  const rows = [...byCode.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "fr-CA") || a.code.localeCompare(b.code));
  return { rows, counted, unverified };
}

// Regions that have at least one employee on the day's inventory list. An empty code is
// "no region". Names come from the Québec region list; an unknown code keeps the code.
export function inventoryRegionChoices(entries, regions) {
  const names = new Map((regions || []).map((region) => [region.code, region.name]));
  const codes = new Set((entries || []).map((entry) => entry.person?.work_region || ""));
  return [...codes]
    .map((code) => ({ code, name: code ? names.get(code) || code : "" }))
    .sort((a, b) => (a.code || "\uffff").localeCompare(b.code || "\uffff", "fr-CA"));
}

// The same crew sum, limited to one work region. Minimum stock ratios are not applied:
// they are not defined yet, and this total is what a later minimum would be compared to.
export function sumRegionInventory(entries, regionCode) {
  const code = regionCode || "";
  return sumCrewInventory((entries || []).filter((entry) => (entry.person?.work_region || "") === code));
}

// Crew-wide defective products: the same sum over each employee's defective list. An employee
// with none to declare is not "unverified"; one whose picture is unread or unmatched is.
export function sumCrewDefective(entries) {
  return sumCrewInventory((entries || []).map((entry) => ({
    name: entry.name,
    state: ["ok", "none"].includes(entry.defective?.state) ? "ok" : "review",
    items: entry.defective?.items || [],
  })));
}

// Employees away all day (a full-day time-off row: congé, vacances, absence, maladie…) who sent no
// screenshot are not « missing »: they get `off` (the time-off row) and go to the end of the list,
// shown greyed. Someone away who still sent a list keeps their normal state. Partial days
// (start_time) do not count as away.
export function markInventoryAbsences(entries, timeOffRows, date) {
  const offBy = new Map();
  for (const row of timeOffRows || []) {
    if (row.start_time || offBy.has(row.user_id) || !isOffOn(row, date)) continue;
    offBy.set(row.user_id, row);
  }
  const marked = (entries || []).map((entry) => ({
    ...entry,
    off: entry.state === "missing" ? offBy.get(entry.person.id) || null : null,
  }));
  return [...marked.filter((entry) => !entry.off), ...marked.filter((entry) => entry.off)];
}
