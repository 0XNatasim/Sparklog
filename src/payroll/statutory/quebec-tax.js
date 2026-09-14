import { toDollars, roundCents, toCents, money } from "../money.js";

function bracketFor(brackets, annual) {
  return brackets.find((b) => annual <= b.upTo) || brackets[brackets.length - 1];
}

// Québec income tax — Revenu Québec TP-1015.F annualized formula (spec step 10).
// Computed SEPARATELY from the federal formula (never a switch): the taxable base,
// brackets, worker deduction and credit values are Québec's own. Structure only —
// full TP-1015.F edge cases await validation. Constants come from the rule set.
export function calculateQuebecTax({
  taxableThisPeriod, // cents
  periodsPerYear,
  rules,
  credits, // { rrqBaseCents, eiCents, rqapCents } — employee period contributions
  personalTaxCredits, // dollars; defaults to basic personal amount (TP-1015.3)
  annualDeductions = 0, // cents
  additionalTax = 0, // dollars per period
}) {
  const r = rules.quebecTax;
  const P = periodsPerYear;
  // Worker deduction (déduction pour travailleur) reduces the taxable base.
  const workerDeduction = Math.min(r.workerDeduction, P * toDollars(taxableThisPeriod));
  const Y = P * toDollars(taxableThisPeriod) - toDollars(annualDeductions) - workerDeduction;
  if (Y <= 0) {
    return { taxCents: Math.max(0, toCents(additionalTax)), explanation: { module: "quebecTax", annualTaxable: money(0), note: "No taxable income" } };
  }

  const b = bracketFor(r.brackets, Y);
  const claim = personalTaxCredits != null ? personalTaxCredits : r.basicPersonalAmount;

  // Québec values personal tax credits (TP-1015.3) at the lowest rate. Unlike the
  // federal formula, Québec has no separate QPP/EI/QPIP contribution credit.
  const personalCredit = r.lowestRate * claim;

  const annualTax = Math.max(0, b.rate * Y - b.K - personalCredit);
  const periodTax = annualTax / P + additionalTax;
  const taxCents = Math.max(0, roundCents(periodTax));

  return {
    taxCents,
    explanation: {
      module: "quebecTax",
      annualTaxable: money(roundCents(Y)),
      workerDeduction: money(roundCents(workerDeduction)),
      bracketRate: b.rate,
      bracketConstantK: b.K,
      personalTaxCredits: claim,
      personalCredit: money(roundCents(personalCredit)),
      annualTax: money(roundCents(annualTax)),
      periodsPerYear: P,
      tax: money(taxCents),
    },
  };
}
