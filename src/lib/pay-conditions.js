import { hasPayRules, parsePayAmount, payRuleToggles, reimbursements } from "@/lib/pay-options";
import { isAdminEmployee, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { TRAVEL_RULE_SECTIONS, travelRuleEmployees } from "@/lib/travel-rules";

// Gestion › Configuration › Conditions de paie: ONE table, a row per employee, that gathers what the employee card
// (« Paie et options ») and Admin › « Trajets et frais » already hold. Nothing is stored here: a box or an amount is saved
// to the same profiles column as the card, a travel line through the same RPC as « Trajets et frais ».

// Columns read from `profiles` (the screen selects exactly these).
export const PAY_CONDITION_PROFILE_COLUMNS = Object.freeze([
  "id", "full_name", "email", "role", "is_paused", "employee_number",
  "first_trip_unpaid", "return_with_benefits_to_8h", "overtime_first_hour_double", "ten_hour_days", "team_leader_premium_overtime",
  "team_leader_premium", "team_leader_premium_ccq",
  "km_rate", "phone_data_reimbursement", "storage_compensation", "storage_compensation_amount",
  "parking_receipts_enabled", "inventory_screenshots_enabled", "km_apart_from_capture", "hourly_rate",
]);

const toggle = (field, labelKey, hintKey) => Object.freeze({ key: field, field, kind: "toggle", labelKey, hintKey, shortKey: `payConditions.short.${field}` });
const amount = (field, labelKey, unitKey, hintKey) => Object.freeze({ key: field, field, kind: "amount", labelKey, unitKey, hintKey, shortKey: `payConditions.short.${field}` });

// The groups of columns, in the order of the employee card. `travel` columns come from the travel rules (one per line).
export const PAY_CONDITION_GROUPS = Object.freeze([
  Object.freeze({ id: "time", labelKey: "payConditions.group.time", columns: Object.freeze([
    toggle("first_trip_unpaid", "settings.firstTrip.title", "settings.firstTrip.help"),
    toggle("return_with_benefits_to_8h", "employees.returnWithBenefits", "employees.returnWithBenefitsHint"),
    toggle("overtime_first_hour_double", "employees.otFirstHourDouble", "employees.otFirstHourDoubleHint"),
    toggle("ten_hour_days", "employees.tenHourDays", "employees.tenHourDaysHint"),
  ]) }),
  Object.freeze({ id: "premium", labelKey: "payConditions.group.premium", columns: Object.freeze([
    amount("team_leader_premium", "teamLeader.premium", "payConditions.unit.perHour"),
    amount("team_leader_premium_ccq", "teamLeader.premiumCcq", "payConditions.unit.perHour"),
    toggle("team_leader_premium_overtime", "employees.premiumOnOvertime", "employees.premiumOnOvertimeHint"),
  ]) }),
  Object.freeze({ id: "refund", labelKey: "payConditions.group.refund", columns: Object.freeze([
    amount("hourly_rate", "employees.flatHourlyRate", "payConditions.unit.perHour", "employees.flatHourlyRateHint"),
    amount("km_rate", "employees.kmRate", "payConditions.unit.perKm"),
    amount("phone_data_reimbursement", "employees.phoneData", "payConditions.unit.perWeek", "employees.phoneDataHint"),
    toggle("storage_compensation", "employees.storage", "employees.storageHint"),
    amount("storage_compensation_amount", "payConditions.storageAmount", "payConditions.unit.perWeek"),
  ]) }),
  Object.freeze({ id: "capture", labelKey: "payConditions.group.capture", columns: Object.freeze([
    toggle("parking_receipts_enabled", "employees.parkingReceipts"),
    toggle("inventory_screenshots_enabled", "employees.inventoryScreenshots"),
    toggle("km_apart_from_capture", "employees.kmApartFromCapture", "employees.kmApartFromCaptureHint"),
  ]) }),
  ...TRAVEL_RULE_SECTIONS.map((section) => Object.freeze({
    id: `travel_${section.id}`,
    labelKey: `payConditions.group.travel_${section.id}`,
    travel: true,
    columns: Object.freeze(section.rows.filter((rule) => !rule.fixed).map((rule) => Object.freeze({
      key: rule.key, kind: "travel", labelKey: `travel.rule.${rule.key}`, shortKey: `payConditions.short.${rule.key}`, rule,
    }))),
  })),
]);

export const PAY_CONDITION_COLUMNS = Object.freeze(PAY_CONDITION_GROUPS.flatMap((group) => group.columns));

// A flat hourly rate replaces the CCQ classification for office staff and the owner.
const isOffice = (role) => isNonCcqRole(role) && !isSubcontractorRole(role);

// What a cell is for ONE employee: `applies` false = nothing to set (shown « — »), `locked` = shown but fixed by the role.
export function cellState(column, profile) {
  const role = profile?.role;
  const none = { applies: false, locked: false, value: null };
  if (!profile) return none;
  if (column.kind === "travel") {
    return travelRuleEmployees([profile]).length ? { applies: true, locked: false, value: null } : none;
  }
  switch (column.field) {
    case "first_trip_unpaid":
    case "return_with_benefits_to_8h":
    case "overtime_first_hour_double":
    case "ten_hour_days":
    case "team_leader_premium_overtime": {
      if (!hasPayRules(role)) return none;
      const rule = payRuleToggles(profile).find((r) => r.field === column.field);
      if (!rule) return none;
      return { applies: true, locked: Boolean(rule.locked), value: rule.locked ? Boolean(rule.lockedValue) : Boolean(profile[column.field]) };
    }
    case "team_leader_premium":
    case "team_leader_premium_ccq":
      return hasPayRules(role) ? { applies: true, locked: false, value: profile[column.field] ?? null } : none;
    case "hourly_rate":
      return isOffice(role) ? { applies: true, locked: false, value: profile.hourly_rate ?? null } : none;
    case "km_rate":
    case "phone_data_reimbursement":
      return hasPayRules(role) && reimbursements(role).km ? { applies: true, locked: false, value: profile[column.field] ?? null } : none;
    case "storage_compensation":
      return hasPayRules(role) && reimbursements(role).storage ? { applies: true, locked: false, value: Boolean(profile.storage_compensation) } : none;
    case "storage_compensation_amount":
      return hasPayRules(role) && reimbursements(role).storage
        ? { applies: true, locked: !profile.storage_compensation, value: profile.storage_compensation_amount ?? null }
        : none;
    case "parking_receipts_enabled":
      return isOffice(role) ? none : { applies: true, locked: false, value: Boolean(profile.parking_receipts_enabled) };
    case "inventory_screenshots_enabled":
    case "km_apart_from_capture":
      return isOffice(role) || isAdminEmployee(role) ? none : { applies: true, locked: false, value: Boolean(profile[column.field]) };
    default:
      return none;
  }
}

// The value to save for a typed amount: null when empty for a rate (km rate, flat hourly rate), else a number ≥ 0; NaN = invalid.
export function parseConditionAmount(field, raw) {
  const text = String(raw ?? "").trim();
  if (field === "hourly_rate") {
    if (text === "") return null;
    const value = Number(text.replace(",", "."));
    return Number.isNaN(value) || value < 0 ? NaN : value;
  }
  const value = parsePayAmount(field, raw);
  if (field === "km_rate" && typeof value === "number" && value > 9.99) return NaN;
  return value;
}

// Rows of the table: the people of the filter, sorted by employee number (numbers first) then name.
export function payConditionRows(profiles, { search = "", groupId = "", memberIds = null, showPaused = false } = {}) {
  const needle = String(search || "").trim().toLocaleLowerCase("fr-CA");
  const rows = (profiles || []).filter((p) => {
    if (!p || (!showPaused && p.is_paused)) return false;
    if (groupId && !(memberIds && memberIds.has(p.id))) return false;
    if (!needle) return true;
    return [p.full_name, p.email, p.employee_number].some((value) => String(value || "").toLocaleLowerCase("fr-CA").includes(needle));
  });
  const numberOf = (p) => {
    const text = String(p.employee_number ?? "").trim();
    return /^\d+$/.test(text) ? Number(text) : Number.POSITIVE_INFINITY; // « ST-1 » and the unnumbered come after, by name
  };
  return rows.sort((a, b) => numberOf(a) - numberOf(b) || String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "fr-CA"));
}

// Everyone of `rows` a bulk change reaches for this column (the cell applies and is not locked).
export function bulkTargets(column, rows) {
  return (rows || []).filter((p) => {
    const state = cellState(column, p);
    return state.applies && !state.locked;
  });
}
