import { toDollars, roundCents, toCents, money } from "../money.js";

function bracketFor(brackets, annual) {
  return brackets.find((b) => annual <= b.upTo) || brackets[brackets.length - 1];
}

// Federal income tax — CRA T4127 Option-1 annualized formula (spec step 8).
//
// This is the STRUCTURE of the T4127 basic method: annualize, apply the bracket
// rate + constant K, then subtract non-refundable credits valued at the lowest
// rate (TD1 claim, CPP/QPP+EI+QPIP contributions, Canada employment amount).
// It is NOT the full formula — bonus/commission special methods, labour-sponsored
// credits and several factors are out of scope until validation. Constants come
// only from the rule set.
export function calculateFederalTax({
  taxableThisPeriod, // cents
  periodsPerYear,
  rules,
  credits, // { rrqBaseCents, eiCents, rqapCents } — employee period contributions
  td1ClaimAmount, // dollars; defaults to basic personal amount
  annualDeductions = 0, // cents (RRSP, union dues, …) applied annually
  additionalTax = 0, // dollars per period (TD1 extra tax)
}) {
  const r = rules.federalTax;
  const P = periodsPerYear;
  const A = P * toDollars(taxableThisPeriod) - toDollars(annualDeductions);
  if (A <= 0) {
    return { taxCents: Math.max(0, toCents(additionalTax)), explanation: { module: "federalTax", annualTaxable: money(0), note: "No taxable income" } };
  }

  const b = bracketFor(r.brackets, A);
  const claim = td1ClaimAmount != null ? td1ClaimAmount : r.basicPersonalAmount;

  // Annualized employee contributions, each capped at its statutory credit max.
  const annualRrq = Math.min(P * toDollars(credits?.rrqBaseCents || 0), rules.rrq.tier1.employeeMaximum);
  const annualEi = Math.min(P * toDollars(credits?.eiCents || 0), rules.ei.employeeMaximum);
  const annualRqap = Math.min(P * toDollars(credits?.rqapCents || 0), rules.rqap.employeeMaximum);

  const K1 = r.lowestRate * claim; // TD1 personal credits
  const K2 = r.lowestRate * (annualRrq + annualEi + annualRqap); // contribution credits
  const K4 = r.lowestRate * Math.min(A, r.canadaEmploymentAmount); // Canada employment amount

  const basicFederalTax = Math.max(0, b.rate * A - b.K - K1 - K2 - K4);
  // Québec residents' federal tax is reduced by the Québec abatement (16.5%).
  const annualTax = basicFederalTax * (1 - (r.quebecAbatement || 0));
  const periodTax = annualTax / P + additionalTax;
  const taxCents = Math.max(0, roundCents(periodTax));

  return {
    taxCents,
    explanation: {
      module: "federalTax",
      annualTaxable: money(roundCents(A)),
      bracketRate: b.rate,
      bracketConstantK: b.K,
      td1Claim: claim,
      creditContributions: money(roundCents(annualRrq + annualEi + annualRqap)),
      canadaEmploymentAmount: r.canadaEmploymentAmount,
      annualTax: money(roundCents(annualTax)),
      periodsPerYear: P,
      tax: money(taxCents),
    },
  };
}
