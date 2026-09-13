import { toCents, clampToRemaining, money } from "../money.js";

// Normes du travail (CNT / labour standards) — employer-only (spec step 13).
// Assessable pay per employee is capped annually; contribution stops at the cap.
export function calculateLabourStandards({ eligibleThisPeriod, ytd, rules }) {
  const r = rules.labourStandards;
  const maxCents = toCents(r.maxAssessablePerEmployee);
  const ytdEligible = ytd?.labourStandardsIncome || 0;
  const assessable = clampToRemaining(eligibleThisPeriod, ytdEligible, maxCents);
  const contributionCents = Math.round(assessable * r.rate);
  return {
    employerCents: contributionCents,
    assessableAfter: ytdEligible + assessable,
    explanation: {
      module: "labourStandards",
      rate: r.rate,
      maxAssessablePerEmployee: r.maxAssessablePerEmployee,
      ytdEligibleBefore: money(ytdEligible),
      assessableThisPeriod: money(assessable),
      contribution: money(contributionCents),
    },
  };
}
