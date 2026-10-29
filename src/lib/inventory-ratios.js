import { supabase } from "@/supabaseClient";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

// Minimum stock per warehouse (0121): a warehouse is an employee group; the minimum of a device is
// ratio per employee x employees of the group. The comparison itself is done by inventory_stock_levels().
export const MAX_RATIO = 1000;

// Refreshes the page banner and the sidebar badge after a change.
export { INVENTORY_ALERTS_EVENT as RATIOS_EVENT } from "@/lib/inventory-alerts";

const round2 = (value) => Math.round(value * 100) / 100;

// "0,5" and "0.5" both work. Null when not a number above 0 and up to MAX_RATIO (the table refuses the same).
export function parseRatio(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 && number <= MAX_RATIO ? Math.round(number * 1000) / 1000 : null;
}

export const minimumFor = (ratio, headcount) => round2((Number(ratio) || 0) * (Number(headcount) || 0));

export const EQUIPMENT_CODE = /^EQ[0-9]{6}$/;

// Keys of the invalid fields of a ratio row to save.
export function validateRatio({ groupId, code, name, ratio }) {
  const errors = [];
  if (!groupId) errors.push("group");
  if (!EQUIPMENT_CODE.test(String(code || "").trim().toUpperCase())) errors.push("code");
  if (!String(name || "").trim() || String(name).trim().length > 200) errors.push("name");
  if (parseRatio(ratio) === null) errors.push("ratio");
  return errors;
}

// Rows of inventory_stock_levels() that are below their minimum in a warehouse that raises the alert (0122),
// the largest shortfall first.
export const lowStockRows = (levels) => (levels || [])
  .filter((row) => row.is_low && row.alert_enabled)
  .sort((a, b) => (Number(b.minimum) - Number(b.on_hand)) - (Number(a.minimum) - Number(a.on_hand))
    || String(a.group_name).localeCompare(String(b.group_name), "fr-CA"));

export const lowStockCount = (levels) => lowStockRows(levels).length;

// Devices seen on recent lists (one per code, longest name), to pick from when adding a ratio.
export function knownEquipment(rows) {
  const byCode = new Map();
  for (const row of rows || []) {
    const current = byCode.get(row.code);
    if (!current || String(row.name || "").length > String(current.name || "").length) byCode.set(row.code, { code: row.code, name: row.name });
  }
  return [...byCode.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "fr-CA") || a.code.localeCompare(b.code));
}

export async function fetchStockLevels() {
  const { data, error } = await withTimeout(supabase.rpc("inventory_stock_levels"), 12000);
  if (error) throw error;
  return data || [];
}

// Which warehouses (groups) raise the alert: Map of group id -> boolean.
export async function fetchAlertFlags() {
  const { data, error } = await withTimeout(supabase.from("employee_groups").select("id, low_stock_alert").limit(QUERY_BUDGETS.profileReferences), 12000);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, Boolean(row.low_stock_alert)]));
}

export async function setGroupAlert({ groupId, enabled }) {
  const { error } = await withTimeout(supabase.from("employee_groups").update({ low_stock_alert: Boolean(enabled) }).eq("id", groupId), 12000);
  if (error) throw error;
}

export async function fetchKnownEquipment() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await withTimeout(
    supabase.from("inventory_items").select("code, name").eq("section", "inventory").gte("job_date", since).limit(QUERY_BUDGETS.inventoryItems),
    12000,
  );
  if (error) throw error;
  return knownEquipment(data);
}

export async function saveRatio({ groupId, code, name, ratio }) {
  const { error } = await withTimeout(
    supabase.from("inventory_min_ratios").upsert(
      { group_id: groupId, code: String(code).trim().toUpperCase(), name: String(name).trim(), per_employee: parseRatio(ratio) },
      { onConflict: "group_id,code" },
    ),
    12000,
  );
  if (error) throw error;
}

export async function deleteRatio({ groupId, code }) {
  const { error } = await withTimeout(supabase.from("inventory_min_ratios").delete().eq("group_id", groupId).eq("code", code), 12000);
  if (error) throw error;
}
