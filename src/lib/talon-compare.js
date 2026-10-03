// Compare what SparkLog calculated for a week with the real talon of that week.
// Only lines the calculator actually maintains are compared (the legacy "Temps double",
// "Vacances" and "Autre revenu" lines are not tracked as cumulatives).

// Ledger stateKey → comparable on the talon's Sommaire (período column).
export const COMPARABLE_KEYS = [
  "regularEarnings", "vacancesCcq", "ccqLevy", "unionDues", "unionEducationFund",
  "ccqBenefitsAdvantage", "ccqBenefitsDeduction", "ccqTaxableBenefit", "safetyEquipment",
  "medicInsurance", "insuranceSalesTax", "quebecTax", "federalTax", "eiEmployee", "rrqEmployee",
  "rqapEmployee", "insurableIncomeEI", "pensionableIncomeRRQ", "insurableIncomeRQAP",
  "kmIndemnity", "hoursYtd",
];

const cents = (v) => Math.round((Number(v) || 0) * 100);

// "2,555.21" → 2555.21 (null when absent).
export function parseMoney(text) {
  if (text == null || text === "") return null;
  const v = Number(String(text).replace(/[\s$,]/g, ""));
  return Number.isFinite(v) ? v : null;
}

function line(label, app, talon, unit = "$") {
  const diffCents = talon == null || app == null ? null : cents(app) - cents(talon);
  return { label, app, talon, unit, diff: diffCents == null ? null : diffCents / 100, ok: diffCents === 0 };
}

// opening/closing: ledger snapshots (dollars). totals: payTotals(). talon: buildTalonFromItems().
export function compareWithTalon({ opening, closing, totals, talon }) {
  const header = talon.header || {};
  const totalsRows = [
    line("Gains", totals.gains, parseMoney(header.gains)),
    line("Retenues", totals.totalRetenues, parseMoney(header.retenues)),
    line("Paie nette", totals.netPlusReimb, parseMoney(header.paieNette)),
  ].filter((r) => r.talon != null);

  const lines = [];
  const seen = new Set();
  for (const row of talon.sommaire || []) {
    if (!row.key || !COMPARABLE_KEYS.includes(row.key) || seen.has(row.key) || row.periode == null) continue;
    seen.add(row.key);
    const appPeriod = (Number(closing[row.key]) || 0) - (Number(opening[row.key]) || 0);
    lines.push({ key: row.key, ...line(row.description, Math.round(appPeriod * 100) / 100, row.periode, row.key === "hoursYtd" ? "h" : "$") });
  }
  const all = [...totalsRows, ...lines];
  return {
    totals: totalsRows,
    lines,
    mismatches: all.filter((r) => !r.ok).length,
    exact: all.length > 0 && all.every((r) => r.ok),
  };
}
