import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("../supabaseClient", () => ({ supabase: {} }));

import { buildDayRounding } from "./payroll-calculations";
import { weekRoundingSummary } from "./day-rounding";

const job = (id, job_date, depart, fin) => ({ id, job_date, depart, arrivee: depart, fin });
// Week of Sunday 2026-10-18 → Saturday 2026-10-24 (after the 2026-10-11 start).
const START = "2026-10-18", END = "2026-10-24";

describe("weekRoundingSummary", () => {
  const rounding = buildDayRounding([
    job("a", "2026-10-14", "07:00", "15:07"), // the week before: 8h07 → 8h00, counter −7
    job("b", "2026-10-19", "07:00", "15:07"), // Mon 8h07: 487 − (−7) = 494 → 495, +8, counter +1
    job("c", "2026-10-20", "07:00", "15:08"), // Tue 8h08: 488 − 1 = 487 → 480, −8, counter −7
  ]);

  it("sums the worked and paid minutes and the difference of the days of the week", () => {
    expect(weekRoundingSummary(rounding, START, END)).toEqual({ days: 2, worked: 975, paid: 975, delta: 0, counter: -7 });
  });

  it("carries the counter of the earlier days: the previous week alone", () => {
    expect(weekRoundingSummary(rounding, "2026-10-11", "2026-10-17")).toEqual({ days: 1, worked: 487, paid: 480, delta: -7, counter: -7 });
  });

  it("shows nothing for a week with no counted day, or without a counter", () => {
    expect(weekRoundingSummary(rounding, "2026-10-25", "2026-10-31")).toMatchObject({ days: 0, delta: 0, counter: 0 });
    expect(weekRoundingSummary(undefined, START, END)).toEqual({ days: 0, worked: 0, paid: 0, delta: 0, counter: 0 });
  });
});
