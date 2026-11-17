import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { overtimeProofsRequired } from "./overtime-evidence-check";

const job = (id, depart, minutes) => ({ id, depart, minutes });
const required = (jobs, options = {}) => overtimeProofsRequired(jobs, { minutesOf: (j) => j.minutes, ...options });

describe("overtimeProofsRequired — one screenshot per work order past the 8 h line", () => {
  it("is 0 for a day at or under 8 h", () => {
    expect(required([job("a", "06:00", 480)])).toBe(0);
    expect(required([job("a", "06:00", 300), job("b", "11:00", 180)])).toBe(0);
  });

  it("counts the job that crosses the line and every job after it", () => {
    expect(required([job("a", "06:00", 360), job("b", "12:00", 180)])).toBe(1);          // 6 h + 3 h: b crosses
    expect(required([job("a", "06:00", 360), job("b", "12:00", 180), job("c", "15:00", 60)])).toBe(2); // c is past the line too
  });

  it("uses the order of the Départ, not the order the jobs were entered", () => {
    const entered = [job("c", "15:00", 60), job("a", "06:00", 360), job("b", "12:00", 180)];
    expect(required(entered)).toBe(2);
    // The earliest job entered last can push a later job past the line.
    expect(required([job("b", "12:00", 300), job("a", "06:00", 300)])).toBe(1);
  });

  it("takes the first unpaid trip off the day's first job", () => {
    const jobs = [job("a", "06:00", 480), job("b", "14:00", 30)];
    expect(required(jobs)).toBe(1);
    expect(required(jobs, { unpaidTripMinutes: 45 })).toBe(0); // 435 + 30 = 465 ≤ 480
  });

  it("uses 10 h with « 4 jours de 10 h »", () => {
    const jobs = [job("a", "06:00", 540), job("b", "15:00", 120)];
    expect(required(jobs, { thresholdMinutes: 600 })).toBe(1);
    expect(required([job("a", "06:00", 540), job("b", "15:00", 60)], { thresholdMinutes: 600 })).toBe(0);
  });
});
