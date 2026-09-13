import { money } from "../money.js";

// FDRCMO — Fonds de développement et de reconnaissance des compétences de la
// main-d'œuvre (1 %), employer-only (spec step 14). Applies only above a payroll
// threshold and is reconciled annually; the per-period figure is an estimate.
export function calculateWorkforceFund({ eligibleThisPeriod, rules, employer }) {
  const r = rules.workforceFund;
  const applicable = !!employer?.workforceSkillsFundApplicable
    || (employer?.annualPayrollEstimate || 0) > r.payrollThreshold;
  const contributionCents = applicable ? Math.round(eligibleThisPeriod * r.rate) : 0;
  return {
    employerCents: contributionCents,
    applicable,
    estimated: true, // annual reconciliation
    explanation: {
      module: "workforceFund",
      applicable,
      payrollThreshold: r.payrollThreshold,
      rate: r.rate,
      base: money(eligibleThisPeriod),
      contribution: money(contributionCents),
      note: applicable ? "Estimate; reconciled annually." : "Below payroll threshold — not applicable.",
    },
  };
}
