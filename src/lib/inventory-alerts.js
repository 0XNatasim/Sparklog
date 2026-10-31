import { supabase } from "@/supabaseClient";
import { canonicalEquipmentName } from "@/lib/equipment-names";
import { withTimeout } from "@/lib/utils";

// The Inventory page and the sidebar badge both listen for this after a dismiss.
export const INVENTORY_ALERTS_EVENT = "sparklog:inventory-alerts";

// The alert function on the server may return only user_id (until migration 0105).
// Profiles already hold the name, so fill it in before grouping.
// Prefer the name already loaded on the Inventory page. The alert row falls back to
// the account id when the server function does not return full_name.
export function alertDisplayName(alert, people) {
  const person = (people || []).find((entry) => entry.id === alert?.userId);
  const fromList = String(person?.full_name || "").trim() || String(person?.email || "").trim();
  if (fromList) return fromList;
  if (alert?.name && alert.name !== alert.userId) return alert.name;
  return alert?.name || "";
}

export function namesForAlerts(rows, profiles) {
  const byId = new Map();
  for (const profile of profiles || []) {
    const name = String(profile.full_name || "").trim() || String(profile.email || "").trim();
    if (profile.id && name) byId.set(profile.id, name);
  }
  return (rows || []).map((row) => {
    if (String(row?.full_name || "").trim()) return row;
    const name = byId.get(row?.user_id);
    return name ? { ...row, full_name: name } : row;
  });
}

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
      name: canonicalEquipmentName(row.code, row.item_name || row.code),
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
  const rows = data || [];
  const ids = [...new Set(rows.filter((row) => row?.user_id && !String(row.full_name || "").trim()).map((row) => row.user_id))];
  if (ids.length === 0) return rows;
  const { data: profiles, error: profileError } = await withTimeout(
    supabase.from("profiles").select("id, full_name, email").in("id", ids),
    12000
  );
  if (profileError) {
    console.error("[inventory-alerts] names", profileError);
    return rows;
  }
  return namesForAlerts(rows, profiles);
}

export async function dismissInventoryNegativeAlert({ userId, jobDate }) {
  const { error } = await withTimeout(
    supabase.rpc("dismiss_inventory_negative_alert", { p_user_id: userId, p_job_date: jobDate }),
    12000
  );
  if (error) throw error;
}
