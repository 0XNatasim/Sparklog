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

// Date d'embauche (start_date, 0110) and dernier jour travaillé (last_work_date, 0115): the last day can never
// be before the hiring date (the database refuses the same). Returns an i18n key, or null when fine.
export function employmentDatesError(startDate, lastWorkDate) {
  if (startDate && lastWorkDate && lastWorkDate < startDate) return "employees.dates.order";
  return null;
}

// Relevé d'emploi: the dates typed in the employee card win over the ones guessed from the pay data
// (block 10 « Premier jour travaillé » = hiring date, block 11 « Dernier jour payé » = last day worked).
export function roeEmploymentDates(computed, profile) {
  return {
    firstDay: profile?.start_date || computed?.firstDay || null,
    lastDay: profile?.last_work_date || computed?.lastDay || null,
  };
}

// One status per account for the Employés list.
//   active · new_hire (« En attente »: hired, first day of work still to come, account active or not)
//   pending (new sign-up, email validated) · unconfirmed (email not validated yet)
//   mise_a_pied / depart (former employee) · inactive (paused for another reason, e.g. before 0109)
export function employeeStatus(profile, pendingById, today) {
  if (!profile) return "inactive";
  if (DEPARTURE_STATUSES.includes(profile.departure_status)) return profile.departure_status;
  if (isNewHire(profile, today)) return NEW_HIRE;
  if (!profile.is_paused) return "active";
  const pending = pendingById?.get(profile.id);
  if (pending) return pending.email_confirmed ? "pending" : "unconfirmed";
  return "inactive";
}

// Sum of the badges of a menu group's items, shown on its header while the group is closed.
export function groupBadgeTotal(items, badges) {
  return (items || []).reduce((sum, item) => sum + (Number(badges?.[item.id]) || 0), 0);
}
