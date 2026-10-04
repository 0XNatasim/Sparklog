import { roundCents, toDollars } from "./money.js";

// Spec step 16-17. The CCQ / time engine produces GROSS pay lines; this payroll
// engine only receives amounts + a type, and each type declares what it is
// subject to. Keeping this table separate is what lets CCQ stay out of the tax
// engine (spec step 17: TIME → CCQ → GROSS → PAYROLL).

// EarningsTreatment flags: is this amount subject to each statutory calculation?
export const EARNING_TREATMENT = {
  regular:             { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  overtime:            { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  vacation:            { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  statHoliday:         { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  bonus:               { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  commission:          { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  retroactivePay:      { federalTax: true,  quebecTax: true,  rrq: true,  ei: true,  rqap: true,  fss: true,  labourStandards: true },
  // Taxable benefit: taxed and pensionable, but a non-cash benefit is not
  // EI-insurable. _PLACEHOLDER treatment — confirm per benefit type at validation.
  taxableBenefit:      { federalTax: true,  quebecTax: true,  rrq: true,  ei: false, rqap: true,  fss: true,  labourStandards: true },
  // Expense reimbursement: not remuneration — subject to nothing.
  expenseReimbursement:{ federalTax: false, quebecTax: false, rrq: false, ei: false, rqap: false, fss: false, labourStandards: false },
};

export const EARNING_TYPES = Object.keys(EARNING_TREATMENT);

// Sum earnings into per-base gross totals (in cents). Each base only includes the
// earning lines whose treatment marks it subject. `cash` excludes non-cash
// benefits (used for net-pay: a taxable benefit is taxed but not paid out).
export function computeGross(earnings = []) {
  const bases = {
    total: 0, cash: 0,
    federalTax: 0, quebecTax: 0, rrq: 0, ei: 0, rqap: 0, fss: 0, labourStandards: 0,
  };
  const unknownTypes = [];

  for (const line of earnings) {
    const cents = roundCents(line.amount);
    if (!cents) continue;
    const treatment = EARNING_TREATMENT[line.type];
    if (!treatment) { unknownTypes.push(line.type); continue; }

    // Expense reimbursement is money paid out but not remuneration — it belongs
    // in no gross/tax base. (Out of scope for this bench: adding it back to the
    // cheque total. It simply doesn't affect any statutory calculation.)
    if (line.type === "expenseReimbursement") continue;

    bases.total += cents;
    if (line.type !== "taxableBenefit") bases.cash += cents; // non-cash isn't paid out
    for (const base of ["federalTax", "quebecTax", "rrq", "ei", "rqap", "fss", "labourStandards"]) {
      if (treatment[base]) bases[base] += cents;
    }
  }

  return { bases, unknownTypes };
}

export function centsToDollars(cents) {
  return toDollars(cents);
}

// ── Pay lines as the employer's stub prints them ─────────────────────────────
// Each transaction line (units × rate) is rounded to the cent BEFORE the lines are added:
//   « Salaire régulier fixe » 38,25 h × 50,79 = 1 942,7175 → 1 942,72
//   « Régulier à taux horaire » 38,25 h × 4,06 = 155,295   →   155,30   (stub S36: sum 2 098,02,
//   not 2 098,01 from one multiplication at 54,85). Overtime rates are printed to the cent too
//   (temps et demi 76,185 → 76,19). Computed in hundredths so half-cents stay exact.
export function printedLineAmount(units, rate) {
  const u = Number(units) || 0;
  const r = Number(rate) || 0;
  const hundredths = Math.round(u * 100);
  if (Math.abs(u * 100 - hundredths) > 1e-6) return Math.round(u * r * 100) / 100; // not a 0,01 h unit: plain rounding
  return Math.round((hundredths * Math.round(r * 100)) / 100) / 100;
}

export function printedPayLines({ regularHours = 0, ot150Hours = 0, ot200Hours = 0, returnNbHours = 0, baseRate = 0, premium = 0 } = {}) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const base = Number(baseRate) || 0;
  const regularBase = printedLineAmount(regularHours, base);
  const regularPremium = printedLineAmount(regularHours, premium);
  const ot150 = printedLineAmount(ot150Hours, r2(base * 1.5));
  const ot200 = printedLineAmount(ot200Hours, r2(base * 2));
  const returnNoBenefit = printedLineAmount(returnNbHours, base);
  return {
    regularBase, regularPremium, ot150, ot200, returnNoBenefit,
    regular: r2(regularBase + regularPremium), // « Salaire régulier fixe » + « Régulier à taux horaire »
    overtime: r2(ot150 + ot200),
  };
}
