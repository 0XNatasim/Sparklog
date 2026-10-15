// Fixed weekly pay (Paramètres › Paie, employee_tax_profiles.fixed_weekly_hours, migration 0091):
// the employee is paid the same hours every CCQ week at their hourly rate, whatever the jobs —
// the owner's « Régulier à taux horaire 40,00 × 51,0000 » (stub D0038-0002). No CCQ benefits.
// `taxProfile` is the engine shape from taxProfileFromRow (src/lib/payroll-settings.js).
import { isNonCcqRole } from "@/lib/roles";

export function fixedWeeklyHours(taxProfile) {
  const hours = Number(taxProfile?.fixedWeeklyHours) || 0;
  return hours > 0 ? hours : 0;
}

// True when the CCQ week (Sunday → Saturday, YYYY-MM-DD) is paid at the fixed hours: fixed pay is
// set and the week ends on or after its start date (the week holding the start date is the first).
export function isFixedPayWeek(taxProfile, weekEnd) {
  if (!fixedWeeklyHours(taxProfile) || !taxProfile?.fixedPayStart) return false;
  return String(weekEnd) >= String(taxProfile.fixedPayStart);
}

// Employees in the payroll run (Talons, DAS, Paie de la semaine): CCQ trades, plus anyone with
// fixed pay (the owner is a non-CCQ role but gets a weekly stub).
export function isPayrollEmployee(profile, taxProfile) {
  return !isNonCcqRole(profile?.role) || fixedWeeklyHours(taxProfile) > 0;
}
