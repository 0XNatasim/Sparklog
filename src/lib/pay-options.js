import { isAdminEmployee, isManagerRole, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";

// Per-employee pay options (profiles columns): Règles de temps (V2) and the « Paie et options » tab
// of the V3 employee card read the same list, so both show and lock the same boxes.

// Manager and owner accounts carry no per-employee pay rule.
export const hasPayRules = (role) => !isManagerRole(role);

export const isTeamLeader = (p) => Number(p?.team_leader_premium) > 0 || Number(p?.team_leader_premium_ccq) > 0;

// The boxes of one employee. Subcontractors: return always at the simple rate, first OT hour always
// double (shown, locked). « Prime en temps sup. » only for a team leader.
export function payRuleToggles(p) {
  const fixed = isSubcontractorRole(p.role);
  return [
    { field: "first_trip_unpaid", labelKey: "settings.firstTrip.title", hintKey: "settings.firstTrip.help", locked: false },
    { field: "return_with_benefits_to_8h", labelKey: "employees.returnWithBenefits", hintKey: "employees.returnWithBenefitsHint", locked: fixed, lockedValue: false },
    { field: "overtime_first_hour_double", labelKey: "employees.otFirstHourDouble", hintKey: "employees.otFirstHourDoubleHint", locked: fixed, lockedValue: true },
    ...(isTeamLeader(p)
      ? [{ field: "team_leader_premium_overtime", labelKey: "employees.premiumOnOvertime", hintKey: "employees.premiumOnOvertimeHint", locked: fixed, lockedValue: false }]
      : []),
  ];
}

// Office (admin) employees have no km / phone reimbursement (`km` covers both); storage is for CCQ
// tradespeople only.
export function reimbursements(role) {
  const reimbursable = !isAdminEmployee(role);
  return { km: reimbursable, storage: reimbursable && !isNonCcqRole(role) };
}

// A typed amount: empty = none (no km rate, a 0 $ allowance), else a number ≥ 0; NaN = invalid.
export function parsePayAmount(field, raw) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return field === "km_rate" ? null : 0;
  const value = Number(text);
  return Number.isNaN(value) || value < 0 ? NaN : value;
}
