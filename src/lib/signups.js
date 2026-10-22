// New sign-ups waiting for activation, and former employees (migration 0109).
// pending_signups() lists inactive accounts that are not former employees; the side-menu badge on
// Employés counts the ones whose email is confirmed. The badge drops when the account is activated
// (or marked as a former employee): EmployeesPanel fires SIGNUPS_EVENT so it refreshes at once.
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";

export const SIGNUPS_EVENT = "sparklog:signups";
export const DEPARTURE_STATUSES = Object.freeze(["mise_a_pied", "depart"]);
export const MAX_DEPARTURE_NOTE = 500;

export async function fetchPendingSignups() {
  const { data, error } = await withTimeout(supabase.rpc("pending_signups"), 12000);
  if (error) throw error;
  return data || [];
}

// The badge: sign-ups whose email is validated.
export function pendingSignupCount(rows) {
  return (rows || []).filter((row) => row?.email_confirmed).length;
}

// One status per account for the Employés list.
//   active · pending (new sign-up, email validated) · unconfirmed (email not validated yet)
//   mise_a_pied / depart (former employee) · inactive (paused for another reason, e.g. before 0109)
export function employeeStatus(profile, pendingById) {
  if (!profile) return "inactive";
  if (!profile.is_paused) return "active";
  if (DEPARTURE_STATUSES.includes(profile.departure_status)) return profile.departure_status;
  const pending = pendingById?.get(profile.id);
  if (pending) return pending.email_confirmed ? "pending" : "unconfirmed";
  return "inactive";
}

// Sum of the badges of a menu group's items, shown on its header while the group is closed.
export function groupBadgeTotal(items, badges) {
  return (items || []).reduce((sum, item) => sum + (Number(badges?.[item.id]) || 0), 0);
}
