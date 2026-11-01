// The fields an employee card must have filled (CCQ employees): [profile column, label key, card tab].
// The tab says where the field lives, so the card can send the manager there (red outline, tab badge).
export const REQUIRED_EMPLOYEE_FIELDS = Object.freeze([
  ["employee_number", "employees.employeeNumber", "identity"],
  ["phone", "manager.tbl.phone", "identity"],
  ["email", "manager.tbl.email", "identity"],
  ["birth_date", "employees.birthDate", "identity"],
  ["ccq_expiration_date", "employees.ccqExpirationDate", "ccq"],
  ["apprentice_level", "employees.level", "ccq"],
  ["work_region", "employees.workRegion", "ccq"],
  ["union_association", "employees.unionAssociation", "ccq"],
  ["wage_schedule", "employees.wageSchedule", "ccq"],
  ["hourly_rate", "employees.hourlyRate", "ccq"],
  ["km_rate", "employees.kmRate", "pay"],
]);

const isEmpty = (profile, field) => profile[field] == null || String(profile[field]).trim() === "";

// Missing fields as [{ field, label, tab }].
export function getMissingEmployeeItems(profile, t) {
  return REQUIRED_EMPLOYEE_FIELDS
    .filter(([field]) => isEmpty(profile, field))
    .map(([field, labelKey, tab]) => ({ field, label: t(labelKey), tab }));
}

export function getMissingEmployeeFields(profile, t) {
  return getMissingEmployeeItems(profile, t).map((item) => item.label);
}

// { identity: 2, ccq: 1 } — how many missing fields each tab holds.
export function missingCountByTab(items) {
  const counts = {};
  for (const item of items) counts[item.tab] = (counts[item.tab] || 0) + 1;
  return counts;
}
