import { money } from "../money.js";

// CNESST — employer-only, kept separate from the tax engine (spec step 15).
// The rate is employer-file specific (classification-based) with no statutory
// default. Without a rate we do NOT guess: return requires_review (ADR 0001).
export function calculateCnesst({ assessableThisPeriod, employer }) {
  const rate = employer?.cnesstRate;
  if (rate == null) {
    return {
      employerCents: 0,
      requiresReview: true,
      explanation: {
        module: "cnesst",
        note: "No CNESST rate provided (classification-based, employer-specific). requires_review.",
      },
    };
  }
  const contributionCents = Math.round(assessableThisPeriod * rate);
  return {
    employerCents: contributionCents,
    estimated: true,
    explanation: {
      module: "cnesst",
      rate,
      base: money(assessableThisPeriod),
      contribution: money(contributionCents),
      note: "Estimate based on the employer's provisional CNESST rate.",
    },
  };
}
