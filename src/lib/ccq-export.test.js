import { describe, it, expect } from "vitest";
import { weekEndingSaturday, formatAppendixCode, buildCcqWeeklyRecords } from "./ccq-export";

describe("weekEndingSaturday", () => {
  it("returns the same date for a Saturday", () => expect(weekEndingSaturday("2026-06-06")).toBe("2026-06-06"));
  it("rolls a Monday forward to the week-ending Saturday", () => expect(weekEndingSaturday("2026-06-01")).toBe("2026-06-06"));
  it("returns empty for an invalid date", () => expect(weekEndingSaturday("nope")).toBe(""));
});

describe("formatAppendixCode", () => {
  it("hyphenates C3 → C-3", () => expect(formatAppendixCode("C3")).toBe("C-3"));
  it("is idempotent", () => expect(formatAppendixCode("C-3")).toBe("C-3"));
  it("trims whitespace", () => expect(formatAppendixCode(" C6 ")).toBe("C-6"));
  it("is null-safe", () => {
    expect(formatAppendixCode("")).toBeNull();
    expect(formatAppendixCode(null)).toBeNull();
  });
});

describe("buildCcqWeeklyRecords", () => {
  const profile = { id: "u1", full_name: "Test E", nas_employee: "111222333", work_region: "08", wage_schedule: "C3", hourly_rate: 50.79, union_association: "FTQ" };
  const profiles = new Map([["u1", profile]]);
  const mkJob = (date, depart, fin) => ({ id: `${date}-${depart}`, user_id: "u1", job_date: date, depart, fin, return_time_minutes: 0, status: "approved" });

  it("rolls weekly hours over 40 into 50% overtime", () => {
    // Mon..Sat, all in the week ending 2026-06-06; 8h each = 48h total.
    const days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"];
    const jobs = days.map((d) => mkJob(d, "08:00", "16:00"));
    const [rec] = buildCcqWeeklyRecords(jobs, profiles);
    expect(rec.semaineFinissantLe).toBe("2026-06-06");
    expect(rec.heuresRegulieres).toBe(40);
    expect(rec.heuresSup50).toBe(8);
    expect(rec.heuresSup100).toBe(0);
    expect(rec.heuresTotal).toBe(48);
  });

  it("emits the corrected CCQ detail-line fields", () => {
    const [rec] = buildCcqWeeklyRecords([mkJob("2026-06-01", "08:00", "12:00")], profiles);
    expect(rec.nas).toBe("111222333");
    expect(rec.nom).toBe("Test E");
    expect(rec.codeMetier).toBe("220");
    expect(rec.secteurActivite).toBe("C");
    expect(rec.region).toBe("08");
    expect(rec.annexe).toBe("C-3");
    expect(rec.union).toBe("FTQ");
    expect(rec.tauxHoraire).toBe(50.79);
  });
});
