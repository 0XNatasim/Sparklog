// ─────────────────────────────────────────────────────────────────────────────
// CCQ collective-agreement benefit accounting.
//
// This sits UPSTREAM of the pure tax engine (spec step 17: TIME → CCQ → GROSS →
// PAYROLL). It contains NO tax logic. Given a period's worked hours and base wage
// it produces the CCQ benefit amounts and the per-base adjustments the engine then
// folds in through `calculatePayroll({ baseAdjustments })`. Keeping it separate is
// what lets CCQ construction rules stay out of the statutory engine.
//
// ⚠️  DRAFT / TEST-BENCH VALUES — not finalized pay.
// These are collective-agreement figures, not statutory tax constants. Only the
// Électricien (métier 220) annexe C3 line is sourced from a published CCQ table;
// the deductible portion of the "avantages sociaux" is DERIVED (see below) and the
// per-level (apprenti) values are not yet entered. Do not use for real pay.
// ─────────────────────────────────────────────────────────────────────────────

// Confirmed / working CCQ benefit rates (Électricien · métier 220 · annexe C3).
export const CCQ_BENEFIT_RATES = {
  // Indemnité de congés = 13 % of the BASE wage (hours × base rate, EXCLUDING any
  // team-leader premium and OT multiplier). 13 % = vacances 6 % + congés fériés
  // 5,5 % + congés maladie 1,5 %. Source: CCQ collective agreements /
  // `conges_indemnity_rate` table (migration 0038). Verified against Simon's stub
  // (EI/RQAP insurable = base wage + this indemnity, to the cent).
  vacationRateOfBaseWage: 0.13,

  // Avantage imposable additionnel — per worked hour. Électricien (métier 220)
  // annexe C3, secteur ICI 2026-2027. Source:
  // tests/Tableau-Institutionnel-Commercial-2026-2027.pdf ("Avantage imposable",
  // ligne Électricien : 3,377 $ (C3) / 3,408 $ (C2)). Confirmed against the stub
  // (RRQ pensionable = insurable + this amount, to the cent).
  taxableBenefitPerHour: 3.377,

  // Deductible portion of the CCQ "avantages sociaux" employer contribution — per
  // worked hour. It LOWERS Québec taxable income. ⚠️ DERIVED to reproduce Simon
  // Bellerive's D0033-0007 pay stub (Québec tax 352,25 $); NOT yet cross-checked
  // against a published CCQ avantages-sociaux schedule. Confirm before validation.
  socialBenefitsDeductionPerHour: 5.797,
};

// Compute the CCQ benefit amounts and the engine base adjustments for one period.
//   hours    — total worked hours in the period (regular + overtime hours)
//   baseRate — the base hourly wage (WITHOUT the team-leader premium)
//   baseWage — optional explicit base wage; defaults to hours × baseRate
// Returns dollar amounts (the engine converts to cents). Federal taxable income is
// not adjusted here (the indemnity/benefit are taxed federally when paid out).
export function computeCcqBenefits({ hours = 0, baseRate = 0, baseWage, rates = CCQ_BENEFIT_RATES } = {}) {
  const h = Math.max(0, Number(hours) || 0);
  const wage = baseWage != null ? Number(baseWage) || 0 : h * (Number(baseRate) || 0);

  const vacation = wage * rates.vacationRateOfBaseWage; // indemnité de congés (13 %)
  const taxableBenefit = h * rates.taxableBenefitPerHour; // avantage imposable add.
  const socialDeduction = h * rates.socialBenefitsDeductionPerHour; // déduction av. sociaux

  return {
    vacation,
    taxableBenefit,
    socialDeduction,
    baseAdjustments: {
      // 13 % indemnity is insurable (EI/RQAP) and pensionable (RRQ).
      insurableEI: vacation,
      insurableRQAP: vacation,
      // RRQ pensionable also picks up the taxable benefit.
      pensionable: vacation + taxableBenefit,
      // Québec taxable income: + indemnity + taxable benefit − deductible social benefits.
      taxableQuebec: vacation + taxableBenefit - socialDeduction,
      // Federal base unchanged (indemnity/benefit taxed federally on payout).
      taxableFederal: 0,
    },
  };
}
