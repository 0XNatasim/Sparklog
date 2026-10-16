// Sparklog takes over the pay from CCQ week 43 (2026-10-11). Every employee's cumulative of the year was
// imported from Dynacom's « Cumulatif des employés » as one payroll_period_ledger row ending on
// DYNACOM_CUMULATIVE_END (end of week 42). A week that ends before that date was paid by Dynacom and has no
// opening balance in Sparklog, so a preview talon for it would start its cumulatives from zero.
export const DYNACOM_CUMULATIVE_END = "2026-10-10";

// True for a week (its Saturday, YYYY-MM-DD) that Dynacom paid before the imported cumulative.
export function isDynacomOnlyWeek(weekEnd) {
  return Boolean(weekEnd) && String(weekEnd).slice(0, 10) < DYNACOM_CUMULATIVE_END;
}
