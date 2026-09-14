import { money } from "../money.js";

// Fonds des services de santé (FSS) — employer-only (spec step 12).
// The rate depends on the employer category and total annual payroll. The in-year
// rate is an ESTIMATE; the real rate is set at the Sommaire 1 (year-end
// reconciliation), so the result is always flagged estimated.
export function fssRate(rules, { annualPayrollEstimate = 0, fssCategory = "general" }) {
  const r = rules.fss;
  if (fssCategory === "public") return r.public.flatRate;
  const g = fssCategory === "primary_manufacturing" ? r.primary_manufacturing : r.general;
  if (annualPayrollEstimate <= g.lowPayrollThreshold) return g.lowRate;
  if (annualPayrollEstimate >= g.highPayrollThreshold) return g.highRate;
  // Sliding scale: (base + factor × payroll/1,000,000) percent.
  const pct = g.slideBase + g.slideFactor * (annualPayrollEstimate / 1000000);
  return pct / 100;
}

export function calculateFss({ fssBaseThisPeriod, rules, employer }) {
  const rate = fssRate(rules, employer || {});
  const contributionCents = Math.round(fssBaseThisPeriod * rate);
  return {
    employerCents: contributionCents,
    estimated: true, // reconciled at Sommaire 1
    explanation: {
      module: "fss",
      category: employer?.fssCategory || "general",
      annualPayrollEstimate: employer?.annualPayrollEstimate || 0,
      rate,
      base: money(fssBaseThisPeriod),
      contribution: money(contributionCents),
      note: "Estimated in-year rate; real rate set at Sommaire 1.",
    },
  };
}
