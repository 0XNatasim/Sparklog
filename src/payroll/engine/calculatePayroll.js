import { getRules } from "../rules/index.js";
import { computeGross, EARNING_TREATMENT } from "../earnings.js";
import { money, roundCents } from "../money.js";
import { calculateRrq } from "../statutory/rrq.js";
import { calculateEi } from "../statutory/ei.js";
import { calculateRqap } from "../statutory/rqap.js";
import { calculateFederalTax } from "../statutory/federal-tax.js";
import { calculateQuebecTax } from "../statutory/quebec-tax.js";
import { calculateFss } from "../employer/fss.js";
import { calculateLabourStandards } from "../employer/labour-standards.js";
import { calculateWorkforceFund } from "../employer/workforce-fund.js";
import { calculateCnesst } from "../employer/cnesst.js";

// ─────────────────────────────────────────────────────────────────────────────
// The pure payroll engine (spec steps 18-20). The Testing tab and any future
// caller only ever call this — no tax logic lives in the UI (the golden rule).
//
// Deterministic: same input → same output. It never reads the clock for its math
// (only stamps a generatedAt in meta), never touches the network, never mutates
// its inputs. Money is computed in integer cents and surfaced as dollars.
//
// Nothing here is finalized pay. Until the rule set is validated (RULE_VERSION
// .status === "validated") every result carries requiresReview: true.
// ─────────────────────────────────────────────────────────────────────────────
export function calculatePayroll(input) {
  const {
    taxYear,
    provinceOfEmployment,
    payPeriod = {},
    employee = {},
    employer = {},
    earnings = [],
    ytd = {},
    baseAdjustments = {},
  } = input || {};

  const reviewReasons = [];

  // ── Resolve the versioned rule set (never guess an unsupported one) ──
  const resolved = getRules(taxYear, provinceOfEmployment);
  if (!resolved.ok) {
    return requiresReviewResult(input, [resolved.reason]);
  }
  const rules = resolved.rules;

  const periodsPerYear = rules.payPeriodsPerYear[payPeriod.frequency];
  if (!periodsPerYear) {
    return requiresReviewResult(input, [`Unsupported pay frequency "${payPeriod.frequency}".`]);
  }

  if (rules.version?.status !== "validated") {
    reviewReasons.push("Rule set is unvalidated (draft) — constants are placeholders pending specialist sign-off.");
  }

  // ── Gross (spec step 16-17) ──
  const { bases, unknownTypes } = computeGross(earnings);
  if (unknownTypes.length) reviewReasons.push(`Unknown earning type(s): ${[...new Set(unknownTypes)].join(", ")}.`);

  // ── Upstream base adjustments (spec step 17: TIME → CCQ → GROSS → PAYROLL) ──
  // The CCQ layer (or any caller) may fold collective-agreement benefits into the
  // statutory bases BEFORE the tax engine runs. Each value is a dollar delta added
  // to one base only; it never changes cash paid out (that stays `bases.cash`).
  // Example (CCQ construction): the 13% vacation indemnity is pensionable/insurable,
  // the "avantage imposable" is taxable + pensionable, and the "avantages sociaux"
  // deduction lowers taxable income — each lands in a different base.
  if (baseAdjustments && typeof baseAdjustments === "object") {
    const add = (baseKey, dollars) => { bases[baseKey] += roundCents(dollars || 0); };
    add("federalTax", baseAdjustments.taxableFederal);
    add("quebecTax", baseAdjustments.taxableQuebec);
    add("rrq", baseAdjustments.pensionable);
    add("ei", baseAdjustments.insurableEI);
    add("rqap", baseAdjustments.insurableRQAP);
    add("fss", baseAdjustments.fss);
    add("labourStandards", baseAdjustments.labourStandards);
  }

  // ── Employee statutory deductions ──
  const rrq = calculateRrq({ pensionableThisPeriod: bases.rrq, ytd, periodsPerYear, rules });
  const ei = calculateEi({ insurableThisPeriod: bases.ei, ytd, rules });
  const rqap = calculateRqap({ insurableThisPeriod: bases.rqap, ytd, rules });

  const credits = { rrqBaseCents: rrq.tier1.employeeCents, eiCents: ei.employeeCents, rqapCents: rqap.employeeCents };

  const federal = calculateFederalTax({
    taxableThisPeriod: bases.federalTax,
    periodsPerYear, rules, credits,
    td1ClaimAmount: employee.federalTaxProfile?.td1ClaimAmount,
    annualDeductions: roundCents(employee.federalTaxProfile?.annualDeductions || 0),
    additionalTax: employee.federalTaxProfile?.additionalTax || 0,
  });
  const quebec = calculateQuebecTax({
    taxableThisPeriod: bases.quebecTax,
    periodsPerYear, rules, credits,
    personalTaxCredits: employee.quebecTaxProfile?.personalTaxCredits,
    annualDeductions: roundCents(employee.quebecTaxProfile?.annualDeductions || 0),
    additionalTax: employee.quebecTaxProfile?.additionalTax || 0,
  });

  const employeeDeductionsCents =
    federal.taxCents + quebec.taxCents + rrq.employeeCents + ei.employeeCents + rqap.employeeCents;
  const netPayCents = bases.cash - employeeDeductionsCents;

  // ── Employer contributions ──
  const fss = calculateFss({ fssBaseThisPeriod: bases.fss, rules, employer });
  const labour = calculateLabourStandards({ eligibleThisPeriod: bases.labourStandards, ytd, rules });
  const workforce = calculateWorkforceFund({ eligibleThisPeriod: bases.total, rules, employer });
  const cnesst = calculateCnesst({ assessableThisPeriod: bases.total, employer });
  if (cnesst.requiresReview) reviewReasons.push("CNESST rate not provided.");

  const employerContributionsCents =
    rrq.employerCents + ei.employerCents + rqap.employerCents +
    fss.employerCents + labour.employerCents + workforce.employerCents + cnesst.employerCents;

  // ── DAS buckets (spec step 23): Québec (Revenu Québec) vs ARC (federal) ──
  const dasQuebecCents = quebec.taxCents + rrq.employeeCents + rrq.employerCents + rqap.employeeCents + rqap.employerCents + fss.employerCents;
  const dasArcCents = federal.taxCents + ei.employeeCents + ei.employerCents;

  return {
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
    label: "Not finalized payroll · Requires payroll review",

    gross: grossBreakdown(earnings, bases),

    employee: {
      federalTax: money(federal.taxCents),
      quebecTax: money(quebec.taxCents),
      rrq: {
        baseAndFirstAdditional: money(rrq.tier1.employeeCents),
        secondAdditional: money(rrq.tier2.employeeCents),
        total: money(rrq.employeeCents),
      },
      ei: money(ei.employeeCents),
      rqap: money(rqap.employeeCents),
      totalDeductions: money(employeeDeductionsCents),
      netPay: money(netPayCents),
    },

    employer: {
      rrq: money(rrq.employerCents),
      ei: money(ei.employerCents),
      rqap: money(rqap.employerCents),
      fss: money(fss.employerCents),
      labourStandards: money(labour.employerCents),
      workforceFund: money(workforce.employerCents),
      cnesst: money(cnesst.employerCents),
      totalContributions: money(employerContributionsCents),
      totalPayrollCost: money(bases.total + employerContributionsCents),
    },

    das: {
      quebec: money(dasQuebecCents),
      arc: money(dasArcCents),
      total: money(dasQuebecCents + dasArcCents),
    },

    explanation: {
      rrq: rrq.explanation,
      ei: ei.explanation,
      rqap: rqap.explanation,
      federalTax: federal.explanation,
      quebecTax: quebec.explanation,
      fss: fss.explanation,
      labourStandards: labour.explanation,
      workforceFund: workforce.explanation,
      cnesst: cnesst.explanation,
    },

    // Cumulative YTD after this run — for chaining consecutive periods.
    ytdAfter: {
      grossIncome: (ytd.grossIncome || 0) + bases.total,
      federalTax: (ytd.federalTax || 0) + federal.taxCents,
      quebecTax: (ytd.quebecTax || 0) + quebec.taxCents,
      rrqEmployee: (ytd.rrqEmployee || 0) + rrq.tier1.employeeCents,
      rrqEmployer: (ytd.rrqEmployer || 0) + rrq.tier1.employerCents,
      rrq2Employee: (ytd.rrq2Employee || 0) + rrq.tier2.employeeCents,
      rrq2Employer: (ytd.rrq2Employer || 0) + rrq.tier2.employerCents,
      eiEmployee: (ytd.eiEmployee || 0) + ei.employeeCents,
      eiEmployer: (ytd.eiEmployer || 0) + ei.employerCents,
      rqapEmployee: (ytd.rqapEmployee || 0) + rqap.employeeCents,
      rqapEmployer: (ytd.rqapEmployer || 0) + rqap.employerCents,
      pensionableIncomeRRQ: rrq.pensionableAfter,
      insurableIncomeEI: ei.insurableAfter,
      insurableIncomeRQAP: rqap.insurableAfter,
      labourStandardsIncome: labour.assessableAfter,
    },

    meta: {
      taxYear,
      provinceOfEmployment,
      payPeriod,
      periodsPerYear,
      rulesVersion: {
        taxYear: rules.version.taxYear,
        quebec: rules.version.quebec,
        federal: rules.version.federal,
        status: rules.version.status,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

function grossBreakdown(earnings, bases) {
  const byType = {};
  for (const line of earnings) {
    if (!EARNING_TREATMENT[line.type]) continue;
    byType[line.type] = (byType[line.type] || 0) + roundCents(line.amount);
  }
  return {
    regular: money(byType.regular || 0),
    overtime: money(byType.overtime || 0),
    vacation: money(byType.vacation || 0),
    statHoliday: money(byType.statHoliday || 0),
    bonus: money(byType.bonus || 0),
    commission: money(byType.commission || 0),
    retroactivePay: money(byType.retroactivePay || 0),
    taxableBenefits: money(byType.taxableBenefit || 0),
    total: money(bases.total),
    cashTotal: money(bases.cash),
  };
}

function requiresReviewResult(input, reasons) {
  return {
    requiresReview: true,
    reviewReasons: reasons,
    label: "Requires payroll review",
    gross: null,
    employee: null,
    employer: null,
    das: null,
    explanation: null,
    meta: {
      taxYear: input?.taxYear,
      provinceOfEmployment: input?.provinceOfEmployment,
      payPeriod: input?.payPeriod,
      generatedAt: new Date().toISOString(),
    },
  };
}
