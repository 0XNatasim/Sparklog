import { toCents, clampToRemaining, money } from "../money.js";

// RRQ / QPP — two-tier (spec steps 4-5). All amounts in cents.
//
// Tier 1 (base + 1re cotisation supplémentaire): rate on pensionable earnings
// above the pro-rated basic exemption, capped at the annual maximum.
// Tier 2 (2e cotisation supplémentaire): rate on the slice of pensionable
// earnings between the YMPE and the second ceiling, capped at its own maximum.
//
// Once a maximum is reached the withholding stops — enforced by clampToRemaining
// against YTD (Revenu Québec: retenues cease at the maximum).
export function calculateRrq({ pensionableThisPeriod, ytd, periodsPerYear, rules }) {
  const r = rules.rrq;
  const periodExemption = Math.round(toCents(r.basicExemption) / periodsPerYear);
  const ytdPensionable = ytd?.pensionableIncomeRRQ || 0;

  // ── Tier 1 ──
  const contributory1 = Math.max(0, pensionableThisPeriod - periodExemption);
  const rawEmp1 = Math.round(contributory1 * r.tier1.employeeRate);
  const rawEr1 = Math.round(contributory1 * r.tier1.employerRate);
  const employee1 = clampToRemaining(rawEmp1, ytd?.rrqEmployee || 0, toCents(r.tier1.employeeMaximum));
  const employer1 = clampToRemaining(rawEr1, ytd?.rrqEmployer || 0, toCents(r.tier1.employerMaximum));
  // Split tier-1 into the base plan (a tax CREDIT) and the enhancement / "première
  // cotisation supplémentaire" (a tax DEDUCTION from income). base = the creditable
  // portion; the remainder is the deductible enhancement (kept consistent with the
  // clamped total so the two always sum back to `employee1`).
  const employee1Base = Math.min(employee1, Math.round(contributory1 * (r.tier1.baseRate ?? r.tier1.employeeRate)));
  const employee1Enhancement = employee1 - employee1Base;

  // ── Tier 2 (earnings in the band YMPE → upperLimit) ──
  const bandLower = toCents(r.tier2.lowerLimit);
  const bandUpper = toCents(r.tier2.upperLimit);
  const ytdAfter = ytdPensionable + pensionableThisPeriod;
  const tier2Earnings = Math.max(0, Math.min(ytdAfter, bandUpper) - Math.max(ytdPensionable, bandLower));
  const rawEmp2 = Math.round(tier2Earnings * r.tier2.employeeRate);
  const rawEr2 = Math.round(tier2Earnings * r.tier2.employerRate);
  const employee2 = clampToRemaining(rawEmp2, ytd?.rrq2Employee || 0, toCents(r.tier2.employeeMaximum));
  const employer2 = clampToRemaining(rawEr2, ytd?.rrq2Employer || 0, toCents(r.tier2.employerMaximum));

  // Employee contribution portions for the income-tax modules:
  //   baseCreditCents      — base plan, valued as a non-refundable credit
  //   enhancementDeductionCents — enhancement (tier-1 supplément + all of tier-2),
  //                          deducted from taxable income (Québec + federal).
  const baseCreditCents = employee1Base;
  const enhancementDeductionCents = employee1Enhancement + employee2;

  return {
    employeeCents: employee1 + employee2,
    employerCents: employer1 + employer2,
    tier1: { employeeCents: employee1, employerCents: employer1 },
    tier2: { employeeCents: employee2, employerCents: employer2 },
    baseCreditCents,
    enhancementDeductionCents,
    pensionableAfter: ytdAfter,
    explanation: {
      module: "rrq",
      pensionableThisPeriod: money(pensionableThisPeriod),
      periodExemption: money(periodExemption),
      tier1: {
        contributory: money(contributory1),
        rate: r.tier1.employeeRate,
        annualMaximum: r.tier1.employeeMaximum,
        ytdBefore: money(ytd?.rrqEmployee || 0),
        contribution: money(employee1),
        maxReached: employee1 < rawEmp1,
      },
      tier2: {
        band: [r.tier2.lowerLimit, r.tier2.upperLimit],
        earningsInBand: money(tier2Earnings),
        rate: r.tier2.employeeRate,
        annualMaximum: r.tier2.employeeMaximum,
        contribution: money(employee2),
        maxReached: employee2 < rawEmp2,
      },
    },
  };
}
