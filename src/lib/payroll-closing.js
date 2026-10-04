// Pure helpers shared by the payroll tester (Comptabiliser, results card, talon comparison).
// `result` = calculatePayroll output, `ccq` = computeCcqBenefits output (or null), `reimb` =
// { km, phone } non-taxable reimbursements. All amounts are dollars.

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Gross-up presentation matching the CCQ stub: non-cash benefits appear as gains and are
// reversed in the deductions; safety equipment is a paid, non-taxable allowance.
export function payTotals(result, ccq, reimb) {
  const { gross, employee } = result;
  const statutory = employee.federalTax + employee.quebecTax + employee.rrq.total + employee.ei + employee.rqap;
  const reversals = ccq ? ccq.vacation + ccq.taxableBenefit + ccq.employerSocialBenefit : 0;
  const grossUp = gross.total + (ccq ? reversals + ccq.safetyEquipment : 0);
  const withheld = statutory + (ccq ? ccq.netWithholdings : 0);
  const totalRetenues = reversals + withheld;
  const net = grossUp - totalRetenues; // includes the paid safety allowance
  const extraReimb = reimb ? (reimb.km || 0) + (reimb.phone || 0) : 0;
  return { grossUp, totalRetenues, net, extraReimb, gains: grossUp + extraReimb, netPlusReimb: net + extraReimb };
}

// Closing cumulatives = the week's opening balance advanced by this calculation.
export function buildClosing({ opening, result, ccq, reimb, pay }) {
  const a = result.ytdAfter;
  const fromCents = (v) => (Number(v) || 0) / 100;
  const add = (k, v) => (Number(opening[k]) || 0) + (Number(v) || 0);
  const c = ccq;
  const medicPrem = c ? c.medicWithholding / 1.09 : 0;
  // Worked hours for the cumulative « Heures »: the base-rate-only hours count too (S39: 40 + 0,25 + 1,75 = 42).
  const hours = Number(pay.regularHours) + Number(pay.ot150Hours) + Number(pay.ot200Hours) + (Number(pay.baseOnlyHours) || 0);
  // The stubs list « Temps double » on its own line; « Salaire régulier » is the rest of the cash pay
  // (temps et demi included).
  const doubleTime = round2((Number(pay.ot200Hours) || 0) * (Number(pay.baseRate) || 0) * 2);
  const closing = {
    ...opening, // untouched lines keep the opening baseline
    grossIncome: fromCents(a.grossIncome),
    rrqEmployee: fromCents(a.rrqEmployee),
    rrq2Employee: fromCents(a.rrq2Employee),
    eiEmployee: fromCents(a.eiEmployee),
    rqapEmployee: fromCents(a.rqapEmployee),
    federalTax: fromCents(a.federalTax),
    quebecTax: fromCents(a.quebecTax),
    pensionableIncomeRRQ: fromCents(a.pensionableIncomeRRQ),
    insurableIncomeEI: fromCents(a.insurableIncomeEI),
    insurableIncomeRQAP: fromCents(a.insurableIncomeRQAP),
    labourStandardsIncome: fromCents(a.labourStandardsIncome),
    regularEarnings: add("regularEarnings", round2(Number(result.gross?.cashTotal) || 0) - doubleTime),
    doubleTime: add("doubleTime", doubleTime),
    vacancesCcq: add("vacancesCcq", c?.vacation),
    ccqTaxableBenefit: add("ccqTaxableBenefit", c?.taxableBenefit),
    ccqBenefitsDeduction: add("ccqBenefitsDeduction", c?.pensionDeduction),
    ccqBenefitsAdvantage: add("ccqBenefitsAdvantage", c?.employerSocialBenefit),
    medicInsurance: add("medicInsurance", medicPrem),
    insuranceSalesTax: add("insuranceSalesTax", c ? c.medicWithholding - medicPrem : 0),
    unionDues: add("unionDues", c?.unionDues),
    ccqLevy: add("ccqLevy", c?.prelevementCcq),
    unionEducationFund: add("unionEducationFund", c?.caisseEducationSyndicale),
    safetyEquipment: add("safetyEquipment", c?.safetyEquipment),
    kmIndemnity: add("kmIndemnity", reimb?.km),
    hoursYtd: add("hoursYtd", hours),
  };
  Object.keys(closing).forEach((k) => { if (typeof closing[k] === "number") closing[k] = round2(closing[k]); });
  return closing;
}
