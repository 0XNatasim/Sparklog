import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { formatHM, formatHours, hoursBetween } from "./time";

describe("hoursBetween", () => {
  it("computes a same-day span", () => {
    expect(hoursBetween(dayjs("2026-09-09T08:00"), dayjs("2026-09-09T16:00"))).toBe(8);
  });

  it("uses the payroll overnight convention when the end time is earlier", () => {
    expect(hoursBetween(dayjs("2026-09-09T22:00"), dayjs("2026-09-09T06:00"))).toBe(8);
  });

  it("returns zero for equal times", () => {
    expect(hoursBetween(dayjs("2026-09-09T08:00"), dayjs("2026-09-09T08:00"))).toBe(0);
  });

  it("returns zero for missing or invalid values", () => {
    expect(hoursBetween(null, dayjs("2026-09-09T08:00"))).toBe(0);
    expect(hoursBetween(dayjs("invalid"), dayjs("2026-09-09T08:00"))).toBe(0);
  });
});

describe("daily totals across several jobs", () => {
  const day = (...spans) => spans.reduce((sum, [start, end]) => (
    sum + hoursBetween(dayjs(`2026-09-28T${start}`), dayjs(`2026-09-28T${end}`))
  ), 0);
  // History shows totals through formatHours ("8.50") and back to h/min.
  const viaDecimal = (hours) => formatHM(Number(formatHours(hours)));

  it("shows 6:15 → 14:45 split over three jobs as 8h30, not 8h29", () => {
    const total = day(["06:15", "09:38"], ["09:38", "12:34"], ["12:34", "14:45"]);
    expect(formatHM(total)).toBe("8h30");
    expect(viaDecimal(total)).toBe("8h30");
  });

  it("never drifts from the exact minute count, whatever the split", () => {
    let seed = 7;
    const random = (max) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
    for (let run = 0; run < 5000; run += 1) {
      const cuts = Array.from({ length: 2 + random(5) }, () => 300 + random(720)).sort((a, b) => a - b);
      const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const spans = cuts.slice(1).map((end, index) => [clock(cuts[index]), clock(end)]);
      const exact = cuts[cuts.length - 1] - cuts[0];
      const expected = `${Math.floor(exact / 60)}h${String(exact % 60).padStart(2, "0")}`;
      const total = day(...spans);
      expect(formatHM(total)).toBe(expected);
      expect(viaDecimal(total)).toBe(expected);
    }
  });
});
