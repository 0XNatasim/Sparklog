import { describe, expect, it } from "vitest";
import { buildClosing, payTotals } from "./payroll-closing";

describe("buildClosing — « Temps double » on its own line (stub D0014-0008)", () => {
  // 37,5 h régulier + 0,75 h temps double at 50,79 $/h.
  const result = {
    gross: { cashTotal: 1904.63 + 76.19 },
    ytdAfter: {},
  };
  const pay = { regularHours: 37.5, ot150Hours: 0, ot200Hours: 0.75, baseRate: 50.79 };
  it("keeps « Salaire régulier » at 1 904,63 and adds 76,19 to « Temps double »", () => {
    const c = buildClosing({ opening: { regularEarnings: 10054.43, doubleTime: 193.48 }, result, ccq: null, reimb: null, pay });
    expect(c.regularEarnings).toBe(11959.06);
    expect(c.doubleTime).toBe(269.67);
  });
});

describe("buildClosing — base-rate-only hours count in the cumulative « Heures » (S39: 42 h)", () => {
  it("40 + 1,75 + 0,25 = 42", () => {
    const pay = { regularHours: 40, ot150Hours: 0, ot200Hours: 1.75, baseOnlyHours: 0.25, baseRate: 50.79 };
    const c = buildClosing({ opening: { hoursYtd: 947.25 }, result: { gross: { cashTotal: 2384.1 }, ytdAfter: {} }, ccq: null, reimb: null, pay });
    expect(c.hoursYtd).toBe(989.25);
  });
});

describe("buildClosing — « Autre revenu » cumulatif = cellulaire + autre revenu non imposable", () => {
  const result = { gross: { cashTotal: 0 }, ytdAfter: {} };
  const pay = { regularHours: 0, ot150Hours: 0, ot200Hours: 0, baseRate: 50.79 };
  it("adds the 7 $ cellular reimbursement each week (S29 → S30: 105 $)", () => {
    const c = buildClosing({ opening: { otherIncome: 98 }, result, ccq: null, reimb: { km: 0, phone: 7, other: 0 }, pay });
    expect(c.otherIncome).toBe(105);
  });
  it("adds cellular + other (S40: 14 + 7,11 = 21,11)", () => {
    const c = buildClosing({ opening: { otherIncome: 147 }, result, ccq: null, reimb: { km: 0, phone: 14, other: 7.11 }, pay });
    expect(c.otherIncome).toBe(168.11);
  });
  it("keeps the cumulative unchanged when nothing is entered (S37)", () => {
    const c = buildClosing({ opening: { otherIncome: 140 }, result, ccq: null, reimb: { km: 0, phone: 0, other: 0 }, pay });
    expect(c.otherIncome).toBe(140);
  });
});

describe("payTotals — remboursements non imposables saisis (S40)", () => {
  it("km + cellulaire + autre revenu entrent dans Gains et Net + remboursements, pas dans les retenues", () => {
    const result = { gross: { total: 1000 }, employee: { federalTax: 0, quebecTax: 0, rrq: { total: 0 }, ei: 0, rqap: 0 } };
    const t = payTotals(result, null, { km: 224.9, phone: 14, other: 7.11 });
    expect(t.extraReimb).toBeCloseTo(246.01, 2);
    expect(t.gains).toBeCloseTo(1246.01, 2);
    expect(t.totalRetenues).toBe(0);
    expect(t.netPlusReimb).toBeCloseTo(1246.01, 2);
  });
});
