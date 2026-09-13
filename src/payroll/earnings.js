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
