// Compare what SparkLog calculated for a week with the real talon of that week.
// Only lines the calculator actually maintains are compared (the stubs' "Vacances" and
// "Autre revenu" lines are not tracked as cumulatives).

// Ledger stateKey → comparable on the talon's Sommaire (período column).
export const COMPARABLE_KEYS = [
  "regularEarnings", "doubleTime", "vacancesCcq", "ccqLevy", "unionDues", "unionEducationFund",
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
  const exact = all.length > 0 && all.every((r) => r.ok);
  const tolerance = qcTolerance(totalsRows, lines);
  return {
    totals: totalsRows,
    lines,
    mismatches: all.filter((r) => !r.ok).length,
    exact,
    // Only the Québec tax is off by one cent (the employer's software rounds the annualised tax
    // differently on some weeks); Retenues / Paie nette differ by that same cent and nothing else.
    qcTolerated: !exact && tolerance != null,
    qcAdjustment: tolerance, // talon − SparkLog for the Québec tax, in dollars (±0,01)
    acceptable: exact || tolerance != null,
  };
}

// One-cent tolerance on the Québec income tax ONLY. Returns the adjustment (talon − app, dollars) when
// every mismatch is that cent on "Impôt Québec" and its two consequences, else null.
function qcTolerance(totalsRows, lines) {
  const bad = [...totalsRows, ...lines].filter((r) => !r.ok);
  const qc = lines.find((r) => r.key === "quebecTax");
  if (!qc || qc.ok || qc.diff == null || Math.abs(Math.round(qc.diff * 100)) !== 1) return null;
  const allowed = new Set([qc, ...totalsRows.filter((r) => r.label === "Retenues" || r.label === "Paie nette")]);
  if (bad.some((r) => !allowed.has(r))) return null;
  const retenues = totalsRows.find((r) => r.label === "Retenues");
  const net = totalsRows.find((r) => r.label === "Paie nette");
  const d = Math.round(qc.diff * 100);
  // Retenues move with the tax, Paie nette the other way; Gains must be exact (it is in `bad` otherwise).
  if (retenues && !retenues.ok && Math.round(retenues.diff * 100) !== d) return null;
  if (net && !net.ok && Math.round(net.diff * 100) !== -d) return null;
  return -d / 100;
}
