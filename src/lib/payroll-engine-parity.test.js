import { describe, it, expect } from "vitest";
import * as app from "./payroll-calculations";
import * as shared from "../../supabase/functions/_shared/payroll_engine.js";

// The app (browser/preview) and the Edge Function (authority) must run identical pay
// math. This guards against the two copies drifting. Strip the volatile timestamp.
const strip = (r) => ({ ...r, generatedAt: undefined });

const fixtures = [
  [{ id: "a", job_date: "2026-06-01", depart: "08:00", fin: "17:00", return_time_minutes: 0 }],
  ["2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05"].map((d, i) => ({ id: `w${i}`, job_date: d, depart: "08:00", fin: "17:00", return_time_minutes: 0 })),
  [{ id: "m", job_date: "2026-06-01", depart: "06:00", fin: "18:00", return_time_minutes: 60 }, { id: "t", job_date: "2026-06-02", depart: "08:00", fin: "10:00" }],
  [{ id: "ov", job_date: "2026-06-03", depart: "22:00", fin: "06:00", return_time_minutes: 0 }],
];

describe("engine parity: app copy === Edge Function copy", () => {
  it("ENGINE_VERSION matches", () => {
    expect(app.ENGINE_VERSION).toBe(shared.ENGINE_VERSION);
  });

  it("computeWeek produces identical output on every fixture", () => {
    for (const jobs of fixtures) {
      expect(strip(app.computeWeek(jobs))).toEqual(strip(shared.computeWeek(jobs)));
    }
  });
});
