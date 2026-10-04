import { describe, expect, it } from "vitest";
import { buildClosing } from "./payroll-closing";

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
