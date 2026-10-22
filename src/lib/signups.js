// New sign-ups waiting for activation, and former employees (migration 0109).
// New hires (0110) carry the first day of work. pending_signups() lists inactive accounts that are not former employees; the side-menu badge on
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

// New hire (migration 0110): not a former employee, first day of work (start_date) still to come.
// Until that day the person is left off the boards (src/lib/live-crew.js).
export const NEW_HIRE = "new_hire";

export function isNewHire(profile, today) {
  return Boolean(profile && !profile.departure_status && profile.start_date && today && profile.start_date > today);
}

// Value of the « Embauche / départ » picker: a former-employee mark, « new_hire », or "" (none).
export function employmentChoice(profile, today) {
  if (DEPARTURE_STATUSES.includes(profile?.departure_status)) return profile.departure_status;
  return isNewHire(profile, today) ? NEW_HIRE : "";
}

// Columns written when the picker changes from `previous` to `choice`. A new hire needs a date
// (startDate, else nothing is written yet); a former-employee mark keeps the date; « none » after
// « new hire » clears the date (on the boards again), after a former-employee mark only the mark.
export function employmentUpdate(choice, startDate, previous) {
  if (choice === NEW_HIRE) return startDate ? { departure_status: null, start_date: startDate } : null;
  if (DEPARTURE_STATUSES.includes(choice)) return { departure_status: choice };
  return previous === NEW_HIRE ? { departure_status: null, start_date: null } : { departure_status: null };
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
