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

describe("buildClosing — cumulatif « Vacances » = 4 % des lignes « Régulier à taux horaire » (S35 à S40)", () => {
  const result = { gross: { cashTotal: 0 }, ytdAfter: {} };
  const week = (hours, extra = {}) => ({ regularHours: hours, ot150Hours: 0, ot200Hours: 0, baseRate: 50.79, premium: 4.06, ...extra });
  const close = (opening, pay) => buildClosing({ opening: { vacationPay: opening }, result, ccq: null, reimb: null, pay }).vacationPay;
  it("S35: 36,5 h × 4,06 = 148,19 → 5,93", () => { expect(close(0, week(36.5))).toBe(5.93); });
  it("S36: 38,25 h → 155,30 → 6,21 (cumul 12,14)", () => { expect(close(5.93, week(38.25))).toBe(12.14); });
  it("S38: 31 h → 125,86 → 5,03 (cumul 23,67)", () => { expect(close(18.64, week(31))).toBe(23.67); });
  it("S39: prime 162,40 + 0,25 h au taux de base 12,70 → 6,50 + 0,51 = 7,01 (cumul 30,68)", () => {
    expect(close(23.67, week(40, { ot200Hours: 1.75, baseOnlyHours: 0.25 }))).toBe(30.68);
  });
  it("S40: 6,50 → cumul 37,18", () => { expect(close(30.68, week(40))).toBe(37.18); });
  it("sans prime ni heures au taux de base, le cumul ne bouge pas", () => { expect(close(7.02, week(35, { premium: 0 }))).toBe(7.02); });
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
