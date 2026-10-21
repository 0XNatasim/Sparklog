import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";

// The Inventory page and the sidebar badge both listen for this after a dismiss.
export const INVENTORY_ALERTS_EVENT = "sparklog:inventory-alerts";

// One card per employee and inventory day. Rows come from inventory_negative_alerts()
// (one row per negative item). The notice is independent of the day picker.
export function groupInventoryNegativeAlerts(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const userId = row?.user_id;
    const jobDate = row?.job_date;
    if (!userId || !jobDate) continue;
    const key = `${userId}|${jobDate}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        userId,
        jobDate: String(jobDate).slice(0, 10),
        name: String(row.full_name || "").trim() || userId,
        items: [],
      };
      groups.set(key, group);
    }
    if (!row.code || group.items.some((item) => item.code === row.code)) continue;
    group.items.push({
      code: row.code,
      name: row.item_name || row.code,
      quantity: row.quantity,
    });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr-CA") || a.code.localeCompare(b.code));
  }
  return [...groups.values()].sort((a, b) => b.jobDate.localeCompare(a.jobDate) || a.name.localeCompare(b.name, "fr-CA"));
}

export async function fetchInventoryNegativeAlerts() {
  const { data, error } = await withTimeout(supabase.rpc("inventory_negative_alerts"), 12000);
  if (error) throw error;
  return data || [];
}

export async function dismissInventoryNegativeAlert({ userId, jobDate }) {
  const { error } = await withTimeout(
    supabase.rpc("dismiss_inventory_negative_alert", { p_user_id: userId, p_job_date: jobDate }),
    12000
  );
  if (error) throw error;
}
