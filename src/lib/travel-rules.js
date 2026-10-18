// Trajets, km et frais — one rule per employee and per line (owner decision 2026-10-18, NOOB.md
// étape 7). Gestion › Admin › Trajets et frais records the choices; the payroll engine does NOT read
// them yet: the default of each line is what the app pays today. Keep the keys and choices in step
// with the check constraint of migration 0101 (travel-rules.test.js reads it).

// Choice sets: time is paid CCQ / non-CCQ / not paid; km and amounts are reimbursed or not.
export const TIME_CHOICES = Object.freeze(["ccq", "non_ccq", "unpaid"]);
export const REIMBURSE_CHOICES = Object.freeze(["reimbursed", "not_reimbursed"]);

const row = (key, kind, defaultChoice, convention, extra = {}) => Object.freeze({
  key,
  kind,
  choices: kind === "time" ? TIME_CHOICES : REIMBURSE_CHOICES,
  defaultChoice,
  convention,
  ...extra,
});

// `fixed` lines have no option (decision 2026-10-18): shown for reference only.
export const TRAVEL_RULE_SECTIONS = Object.freeze([
  Object.freeze({ id: "time", rows: Object.freeze([
    row("time_home_to_warehouse", "time", "unpaid", "23.04 1), 2) a)"),
    row("time_home_to_first_client", "time", "ccq", "23.04 1)"),
    row("time_warehouse_to_client", "time", "ccq", "23.01 2)"),
    row("time_client_to_client", "time", "ccq", "23.01 2)"),
    row("time_return_to_warehouse", "time", "ccq", "23.04 2) a), 23.15"),
    row("time_client_to_home", "time", "unpaid", "23.04 1)", { thresholdKm: 65 }),
    row("time_warehouse_to_home", "time", "unpaid", "23.04 1)"),
    row("time_weekend_holiday", "time", "ccq", "21.01, 21.02 b)", { conventionRequired: true }),
    Object.freeze({ key: "fixed_supplier_wait_warehouse", fixed: true, convention: "23.01 2)" }),
  ]) }),
  Object.freeze({ id: "km", rows: Object.freeze([
    row("km_home_to_warehouse", "km", "not_reimbursed", "23.05"),
    row("km_home_to_first_client", "km", "reimbursed", "23.05"),
    row("km_warehouse_to_client", "km", "reimbursed", "23.05"),
    row("km_client_to_client", "km", "reimbursed", "23.05"),
    row("km_client_to_warehouse", "km", "reimbursed", "23.05"),
    row("km_client_to_home", "km", "not_reimbursed", "23.05"),
    row("km_warehouse_to_home", "km", "not_reimbursed", "23.05"),
  ]) }),
  Object.freeze({ id: "amounts", rows: Object.freeze([
    row("far_site_65km", "time", "unpaid", "23.09 1)"),
    row("ferry", "amount", "not_reimbursed", "23.09 1) a)"),
    row("parking", "amount", "reimbursed", "23.02"),
    row("supper", "amount", "reimbursed", "20.07 3) c)", { conventionRequired: true }),
  ]) }),
]);

export const TRAVEL_RULES = Object.freeze(TRAVEL_RULE_SECTIONS.flatMap((s) => s.rows).filter((r) => !r.fixed));
export const TRAVEL_RULE_KEYS = Object.freeze(TRAVEL_RULES.map((r) => r.key));
const byKey = new Map(TRAVEL_RULES.map((r) => [r.key, r]));

export function travelRule(key) {
  return byKey.get(key) || null;
}

export function isValidTravelChoice(key, choice) {
  const rule = byKey.get(key);
  return Boolean(rule && rule.choices.includes(choice));
}

// Who the grid is for: active CCQ tradespeople (no office staff, owner or subcontractors).
export function travelRuleEmployees(people) {
  return (people || [])
    .filter((p) => p && !p.is_paused && !["admin", "owner", "subcontractor_1"].includes(p.role))
    .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "fr-CA"));
}

// The setting in force on `onDate` (YYYY-MM-DD) for each (employee, rule): the latest row whose
// effective_from is on or before that date. Rows for later dates are planned changes.
export function currentTravelRules(rows, onDate) {
  const current = new Map(); // `${user_id}|${rule_key}` -> row
  for (const r of rows || []) {
    if (!r || String(r.effective_from) > String(onDate)) continue;
    const k = `${r.user_id}|${r.rule_key}`;
    const prev = current.get(k);
    if (!prev || String(r.effective_from) > String(prev.effective_from)) current.set(k, r);
  }
  return current;
}

// The value an employee gets for a rule: their setting, else the line's default (what the app pays today).
export function travelRuleValue(current, userId, key) {
  const rule = byKey.get(key);
  const set = current.get(`${userId}|${key}`);
  return {
    choice: set?.choice ?? rule?.defaultChoice ?? null,
    britton: set ? set.billed_to_britton ?? null : null,
    thresholdKm: set?.threshold_km != null ? Number(set.threshold_km) : rule?.thresholdKm ?? null,
    isSet: Boolean(set),
  };
}

// One line of the grid summarised over the employees: counts per choice, how many still on the
// default, Britton yes / no / not set, and whether everyone has the same choice.
export function summarizeTravelRule(current, key, employees) {
  const counts = {};
  let unset = 0;
  const britton = { yes: 0, no: 0, unknown: 0 };
  for (const e of employees || []) {
    const v = travelRuleValue(current, e.id, key);
    counts[v.choice] = (counts[v.choice] || 0) + 1;
    if (!v.isSet) unset += 1;
    if (v.britton === true) britton.yes += 1;
    else if (v.britton === false) britton.no += 1;
    else britton.unknown += 1;
  }
  const choices = Object.keys(counts);
  return { counts, unset, britton, total: (employees || []).length, uniform: choices.length === 1 ? choices[0] : null };
}

// Default « en vigueur à partir de » : the Sunday that starts the CCQ week of `today` (YYYY-MM-DD).
export function weekStartOf(today) {
  const d = new Date(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
