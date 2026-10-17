// Sparklog takes over the pay from CCQ week 43 (2026-10-11). Every employee's cumulative of the year was
// imported from Dynacom's « Cumulatif des employés » as one payroll_period_ledger row ending on
// DYNACOM_CUMULATIVE_END (end of week 42). A week that ends before that date was paid by Dynacom and has no
// opening balance in Sparklog, so a preview talon for it would start its cumulatives from zero.
export const DYNACOM_CUMULATIVE_END = "2026-10-10";

// True for a week (its Saturday, YYYY-MM-DD) that Dynacom paid before the imported cumulative.
export function isDynacomOnlyWeek(weekEnd) {
  return Boolean(weekEnd) && String(weekEnd).slice(0, 10) < DYNACOM_CUMULATIVE_END;
}

// True for a week Sparklog must never post (« Comptabiliser ») : every week up to and including week 42,
// whose closing IS the Dynacom cumulative row. Posting it would replace that row with a computed one that
// starts from zero. Only real talons (imported, or validated against the real one) may still be kept for
// those weeks. The database enforces the same date (migration 0099, protect_dynacom_cumulative).
export function isClosedBeforeSparklog(weekEnd) {
  return Boolean(weekEnd) && String(weekEnd).slice(0, 10) <= DYNACOM_CUMULATIVE_END;
}
