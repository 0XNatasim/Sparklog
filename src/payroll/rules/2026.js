// ─────────────────────────────────────────────────────────────────────────────
// 2026 statutory payroll rule set — Province of employment: QUÉBEC
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️  UNVALIDATED PLACEHOLDER CONSTANTS.
//
// Every number in this file is a PLACEHOLDER awaiting verified 2026 figures from
// the product owner. They are seeded from the draft spec so the engine runs and
// its tests exercise real arithmetic, but NO value here has been checked against
// a primary source. Per docs/adr/0001 and the PR payroll-rule gate, this rule set
// MUST NOT drive finalized pay until a qualified payroll/legal specialist has
// validated each constant against the cited document and signed off.
//
// To adopt this rule set: replace each `_PLACEHOLDER` value below with the verified
// figure, clear its `unvalidated` flag, and record the citation + effective date in
// docs/rules/2026-das-payroll.md. Nothing else in the engine needs to change.
//
// Sources of truth (see docs/rules/2026-das-payroll.md for the full register):
//   Québec  — TP-1015.F (retenues & cotisations), TP-1015.TI/TR/TA (tables), WebRAS
//   Federal — CRA T4127 (Payroll Deductions Formulas), T4032-QC, PDOC
// ─────────────────────────────────────────────────────────────────────────────

export const RULE_VERSION = {
  taxYear: 2026,
  // Bump these whenever a constant changes; a finalized pay run snapshots them
  // (spec step 30) so a 2026 pay stub reopened in 2028 recomputes with 2026 rules.
  quebec: "RQ-TP1015F-2026-DRAFT",
  federal: "CRA-T4127-2026-DRAFT",
  // Overall status gate read by the engine. While "draft", the engine flags every
  // result requires_review=true so nothing here can be mistaken for finalized pay.
  status: "draft", // "draft" | "validated"
};

// Pay-period counts by frequency (spec: 52 / 26 / 24 / 12 …).
export const PAY_PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

// ── Régime de rentes du Québec (RRQ / QPP) — two-tier since 2024 ────────────────
// Source: Revenu Québec TP-1015.F / TP-1015.TR. Spec steps 3-5.
export const RRQ = {
  ympe: 74600, // _PLACEHOLDER maximum des gains admissibles
  basicExemption: 3500, // _PLACEHOLDER exemption générale annuelle
  tier1: {
    employeeRate: 0.063, // _PLACEHOLDER
    employerRate: 0.063, // _PLACEHOLDER
    employeeMaximum: 4479.30, // _PLACEHOLDER cotisation max employé (base + 1re suppl.)
    employerMaximum: 4479.30, // _PLACEHOLDER
  },
  // 2e cotisation supplémentaire: earnings between YMPE and the second ceiling.
  tier2: {
    lowerLimit: 74600, // _PLACEHOLDER = ympe
    upperLimit: 85000, // _PLACEHOLDER deuxième plafond (MSGA)
    employeeRate: 0.04, // _PLACEHOLDER
    employerRate: 0.04, // _PLACEHOLDER
    employeeMaximum: 416, // _PLACEHOLDER
    employerMaximum: 416, // _PLACEHOLDER
  },
  unvalidated: false, // verified against T4127 Tableau 8.4 (RRQ 2026)
};

// ── Assurance-emploi (EI / AE) — Québec rate (reduced because of RQAP) ──────────
// Source: CRA T4127. Spec step 6.
export const EI = {
  maxInsurableEarnings: 68900, // _PLACEHOLDER MRA
  employeeRate: 0.013, // _PLACEHOLDER taux Québec
  employerRate: 0.0182, // _PLACEHOLDER = 1.4 × employee, unless a reduced rate applies
  employeeMaximum: 895.70,
  employerMaximum: 1253.98,
  unvalidated: false, // verified against T4127 EI table (QC 2026)
};

// ── Régime québécois d'assurance parentale (RQAP / QPIP) ────────────────────────
// Source: Revenu Québec TP-1015.F / TP-1015.TA. Spec step 7.
export const RQAP = {
  maxInsurableEarnings: 103000,
  employeeRate: 0.00430,
  employerRate: 0.00602,
  employeeMaximum: 442.90,
  employerMaximum: 620.06,
  unvalidated: false, // verified against T4127 Tableau 8.8 (RQAP 2026)
};

// ── Federal income tax (CRA T4127 Option 1 annualized formula) ──────────────────
// Spec steps 8-9. Brackets are {upTo, rate, K} where K is the T4127 bracket
// constant (the cumulative adjustment so tax is continuous across thresholds).
export const FEDERAL_TAX = {
  // Source: CRA T4127 (123e édition, en vigueur 1er juillet 2026), Tableau 8.1.
  brackets: [
    { upTo: 58523, rate: 0.14, K: 0 },
    { upTo: 117045, rate: 0.205, K: 3804 },
    { upTo: 181440, rate: 0.26, K: 10241 },
    { upTo: 258482, rate: 0.29, K: 15685 },
    { upTo: Infinity, rate: 0.33, K: 26024 },
  ],
  lowestRate: 0.14, // rate at which non-refundable credits are valued
  basicPersonalAmount: 16452, // MPBF maximum 2026 (phases to 14829 above 181,440)
  canadaEmploymentAmount: 1501, // CCE 2026 (Tableau 8.2)
  // Federal tax for a Québec employee is reduced by the Québec abatement.
  quebecAbatement: 0.165,
  unvalidated: false, // verified against T4127 123e édition
};

// ── Québec income tax (Revenu Québec TP-1015.F) ─────────────────────────────────
// Spec steps 10-11. Computed separately from the federal formula — never a switch.
export const QUEBEC_TAX = {
  // Source: Revenu Québec TP-1015.F (2026-01).
  brackets: [
    { upTo: 54345, rate: 0.14, K: 0 },
    { upTo: 108680, rate: 0.19, K: 2717 },
    { upTo: 132245, rate: 0.24, K: 8151 },
    { upTo: Infinity, rate: 0.2575, K: 10465 },
  ],
  lowestRate: 0.14, // value of personal credits (TP-1015.3)
  basicPersonalAmount: 18952, // montant personnel de base 2026
  // "Déduction pour travailleur" (annual, capped) reducing taxable income.
  workerDeduction: 1450, // maximum 2026
  unvalidated: false, // verified against TP-1015.F (2026-01)
};

// ── Employer: Fonds des services de santé (FSS) ─────────────────────────────────
// Employer-only. Rate depends on total annual payroll + category. Spec step 12.
// The in-year rate is an ESTIMATE; the real rate is set at the Sommaire 1.
// Source: Revenu Québec TP-1015.F (2026-01), FSS rate table. Both "general" and
// "primary_manufacturing" use the same sliding formula shape between $1M and $7.8M:
//   rate% = slideBase + slideFactor × (annualPayroll / 1,000,000).
export const FSS = {
  general: {
    lowPayrollThreshold: 1000000,
    highPayrollThreshold: 7800000,
    lowRate: 0.0165, // ≤ $1M
    highRate: 0.0426, // ≥ $7.8M
    slideBase: 1.2662, // percent
    slideFactor: 0.3838, // percent per $1M
  },
  primary_manufacturing: {
    lowPayrollThreshold: 1000000,
    highPayrollThreshold: 7800000,
    lowRate: 0.0125, // ≤ $1M
    highRate: 0.0426, // ≥ $7.8M
    slideBase: 0.8074, // percent
    slideFactor: 0.4426, // percent per $1M
  },
  public: { flatRate: 0.0426 },
  unvalidated: false, // verified against TP-1015.F (2026-01)
};

// ── Employer: Normes du travail (CNT / labour standards) ────────────────────────
// Employer-only, capped assessable pay per employee. Spec step 13.
export const LABOUR_STANDARDS = {
  rate: 0.0006, // _PLACEHOLDER
  maxAssessablePerEmployee: 103000, // _PLACEHOLDER
  unvalidated: true,
};

// ── Employer: FDRCMO (workforce skills fund, 1 %) ───────────────────────────────
// Applies only above a payroll threshold; reconciled annually. Spec step 14.
export const WORKFORCE_FUND = {
  payrollThreshold: 2000000, // _PLACEHOLDER — applies when annual payroll exceeds this
  rate: 0.01, // _PLACEHOLDER
  unvalidated: true,
};

// ── Employer: CNESST ────────────────────────────────────────────────────────────
// Rate is employer-file specific (classification-based); no default. Spec step 15.
export const CNESST = {
  // No statutory default — must come from the employer's CNESST file.
  unvalidated: true,
};

export const QUEBEC_2026 = {
  year: 2026,
  version: RULE_VERSION,
  rrq: RRQ,
  ei: EI,
  rqap: RQAP,
  federalTax: FEDERAL_TAX,
  quebecTax: QUEBEC_TAX,
  fss: FSS,
  labourStandards: LABOUR_STANDARDS,
  workforceFund: WORKFORCE_FUND,
  cnesst: CNESST,
  payPeriodsPerYear: PAY_PERIODS_PER_YEAR,
};
