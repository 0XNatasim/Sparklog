import { describe, expect, it } from "vitest";
import { dateBandMap, lastOvertimeJobIds } from "./timesheet-layout";

const job = (id, user, date, depart, fin, extra = {}) => ({ id, user_id: user, job_date: date, depart, fin, ...extra });

describe("lastOvertimeJobIds", () => {
  it("moves the clock from the job that captured the evidence to the day's last job", () => {
    const jobs = [
      job("morning", "u1", "2026-09-24", "06:30", "11:00"),
      job("evening", "u1", "2026-09-24", "12:00", "17:30"),
      job("midday", "u1", "2026-09-24", "11:00", "12:00", { overtime_evidence_captured: true }),
    ];
    expect([...lastOvertimeJobIds(jobs)]).toEqual(["evening"]);
  });

  it("uses the resolved end instant, so an overnight job counts as ending last", () => {
    const jobs = [
      job("day", "u1", "2026-09-24", "08:00", "16:00", { ended_at: "2026-09-24T20:00:00Z", overtime_evidence_captured: true }),
      job("night", "u1", "2026-09-24", "22:00", "02:00", { ended_at: "2026-09-25T06:00:00Z" }),
    ];
    expect([...lastOvertimeJobIds(jobs)]).toEqual(["night"]);
  });

  it("keeps days and employees separate and ignores days without overtime evidence", () => {
    const jobs = [
      job("a1", "u1", "2026-09-24", "08:00", "18:00", { overtime_evidence_captured: true }),
      job("b1", "u2", "2026-09-24", "07:00", "12:00"),
      job("b2", "u2", "2026-09-24", "12:30", "15:00"),
      job("a2", "u1", "2026-09-25", "08:00", "12:00"),
    ];
    expect([...lastOvertimeJobIds(jobs)]).toEqual(["a1"]);
  });
});

describe("dateBandMap", () => {
  it("alternates newest-first and gives a repeated date the same band", () => {
    const bands = dateBandMap(["2026-09-24", "2026-09-26", "2026-09-25", "2026-09-26", null]);
    expect(bands.get("2026-09-26")).toBe(0);
    expect(bands.get("2026-09-25")).toBe(1);
    expect(bands.get("2026-09-24")).toBe(0);
  });
});
