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
