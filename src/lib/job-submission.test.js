import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildJobSaveRpcArgs, buildJobSaveWithEvidenceRpcArgs, dailyOvertimeEvidenceRequirement, kilometreFieldValue, requiresEvidenceBeforeSave } from "./job-submission";

const base = {
  jobDate: "2026-09-26",
  ot: "1234",
  depart: "08:00",
  arrivee: "08:30",
  fin: "17:00",
  kmTotal: 40,
  kmAller: 30,
  returnMinutes: 20,
  kmRetour: 10,
};

describe("buildJobSaveRpcArgs", () => {
  it("carries one stable idempotency key for a new submission", () => {
    const args = buildJobSaveRpcArgs({
      ...base,
      newJobId: "new-id",
      submissionKey: "stable-key",
      submit: true,
    });

    expect(args).toMatchObject({
      p_job_id: null,
      p_new_job_id: "new-id",
      p_submission_key: "stable-key",
      p_submit: true,
      p_return_time_minutes: 20,
    });
    expect(args).not.toHaveProperty("user_id");
    expect(args).not.toHaveProperty("status");
    expect(args).not.toHaveProperty("locked");
  });

  it("identifies an edit without allowing a new-row key or id", () => {
    const args = buildJobSaveRpcArgs({
      ...base,
      editId: "existing-id",
      newJobId: "ignored-id",
      submissionKey: "ignored-key",
      submit: false,
    });

    expect(args.p_job_id).toBe("existing-id");
    expect(args.p_new_job_id).toBeNull();
    expect(args.p_submission_key).toBeNull();
    expect(args.p_submit).toBe(false);
  });
});

describe("manager-entry confirmation", () => {
  it("keeps the exact historical call shape unless the employee confirms", () => {
    const args = buildJobSaveRpcArgs({ ...base, editId: "existing-id", submit: true });
    expect(args).not.toHaveProperty("p_confirm_manager_entry");
  });

  it("sends the confirmation flag only when explicitly requested", () => {
    const args = buildJobSaveRpcArgs({ ...base, editId: "existing-id", submit: true, confirmManagerEntry: true });
    expect(args.p_confirm_manager_entry).toBe(true);
  });
});

describe("requiresEvidenceBeforeSave", () => {
  it("asks for the overtime proof when saving a draft too", () => {
    expect(requiresEvidenceBeforeSave("draft")).toBe(true);
  });

  it("keeps the overtime-proof check on submission", () => {
    expect(requiresEvidenceBeforeSave("submit")).toBe(true);
  });
});

describe("dailyOvertimeEvidenceRequirement", () => {
  const candidate = { id: "b", job_date: "2026-09-29", depart: "13:00", fin: "17:36", status: "saved" };

  it("requires evidence when saved jobs bring the day over 8 hours", () => {
    expect(dailyOvertimeEvidenceRequirement(candidate, [
      { id: "a", job_date: "2026-09-29", depart: "08:00", fin: "13:00", status: "saved", overtime_evidence_captured: false },
    ])).toEqual({ totalMinutes: 576, grossMinutes: 576, required: true });
  });

  it("accepts one proof anywhere on the day and ignores unrelated jobs", () => {
    expect(dailyOvertimeEvidenceRequirement(candidate, [
      { id: "a", job_date: "2026-09-29", depart: "08:00", fin: "13:00", status: "submitted", overtime_evidence_captured: true },
      { id: "other-day", job_date: "2026-09-28", depart: "00:00", fin: "12:00", status: "submitted" },
    ])).toEqual({ totalMinutes: 576, grossMinutes: 576, required: false });
  });
});

// Jean-Marc, 2026-10-09: 2 h 15 + 2 h 49 + 3 h 25 = 8 h 29 gross. With "first trip unpaid"
// the 06:30 → 07:00 trip is not paid, so the paid day is 7 h 59 and no overtime proof is due.
describe("overtime proof threshold with the first-trip-unpaid option", () => {
  const day = [
    { id: "a", job_date: "2026-10-09", depart: "06:30:00", arrivee: "07:00:00", fin: "08:45:00", status: "saved" },
    { id: "b", job_date: "2026-10-09", depart: "08:45:00", arrivee: "08:55:00", fin: "11:34:00", status: "saved" },
  ];
  const third = { id: "c", job_date: "2026-10-09", depart: "11:35", arrivee: "12:04", fin: "15:00", status: "saved" };

  it("still asks for the proof on gross time without the option", () => {
    expect(dailyOvertimeEvidenceRequirement(third, day)).toEqual({ totalMinutes: 509, grossMinutes: 509, required: true });
  });

  it("counts paid time with the option: 7 h 59, no proof", () => {
    expect(dailyOvertimeEvidenceRequirement(third, day, { firstTripUnpaid: true }))
      .toEqual({ totalMinutes: 479, grossMinutes: 509, required: false });
  });

  it("still asks for the proof once the PAID day passes 8 h", () => {
    const later = { ...third, fin: "15:05" };
    expect(dailyOvertimeEvidenceRequirement(later, day, { firstTripUnpaid: true }).required).toBe(true);
  });

  it("removes the trip of the earliest job, whatever the order of entry", () => {
    const entered = { id: "z", job_date: "2026-10-09", depart: "05:30", arrivee: "06:00", fin: "06:30", status: "saved" };
    // The new earliest job owns the unpaid trip (30 min) instead of the 06:30 job.
    expect(dailyOvertimeEvidenceRequirement(entered, day, { firstTripUnpaid: true }).totalMinutes)
      .toBe(60 + 135 + 169 - 30);
  });

  it("removes nothing when the first job has no arrival time", () => {
    const noArrival = day.map((job, index) => (index === 0 ? { ...job, arrivee: null } : job));
    expect(dailyOvertimeEvidenceRequirement(third, noArrival, { firstTripUnpaid: true }).totalMinutes).toBe(509);
  });
});

describe("kilometreFieldValue", () => {
  it("keeps a saved 0 km job complete instead of blanking the field", () => {
    expect(kilometreFieldValue({ km_total: "0", km_aller: "0", km_retour: "0" })).toBe("0");
  });

  it("uses the stored total, or aller + retour for legacy rows", () => {
    expect(kilometreFieldValue({ km_total: "168", km_aller: "94", km_retour: "74" })).toBe("168");
    expect(kilometreFieldValue({ km_total: null, km_aller: "6", km_retour: "3" })).toBe("9");
  });
});

describe("buildJobSaveWithEvidenceRpcArgs", () => {
  it("sends the job, the proof file and the minutes, but never a client proof flag", () => {
    const args = buildJobSaveWithEvidenceRpcArgs({
      ...base,
      newJobId: "new-id",
      submissionKey: "stable-key",
      submit: true,
      overtimeEvidenceCaptured: true,
      evidenceId: "ev-1",
      storagePath: "user/2026-10-13/ev-1.jpg",
      dailyMinutes: 630.4,
    });
    expect(args).toMatchObject({
      p_new_job_id: "new-id",
      p_submission_key: "stable-key",
      p_submit: true,
      p_evidence_id: "ev-1",
      p_storage_path: "user/2026-10-13/ev-1.jpg",
      p_daily_minutes: 630,
    });
    expect(args).not.toHaveProperty("p_overtime_evidence_captured");
  });
});

describe("two captures with the job (migration 0160)", () => {
  const job = { editId: null, newJobId: "j1", submissionKey: "k1", submit: true, jobDate: "2026-11-23", ot: "OT-1", depart: "06:00", arrivee: "06:30", fin: "17:00", kmTotal: 10, kmAller: 5, returnMinutes: 0, kmRetour: 0 };
  it("sends the second proof only when both its id and its path are given, and keeps the old call shape otherwise", () => {
    const one = buildJobSaveWithEvidenceRpcArgs({ ...job, evidenceId: "e1", storagePath: "u/2026-11-23/e1.jpg", dailyMinutes: 120 });
    expect(one).not.toHaveProperty("p_evidence_id_2");
    expect(one).not.toHaveProperty("p_storage_path_2");
    const two = buildJobSaveWithEvidenceRpcArgs({ ...job, evidenceId: "e1", storagePath: "u/2026-11-23/e1.jpg", dailyMinutes: 120, secondEvidenceId: "e2", secondStoragePath: "u/2026-11-23/e2.jpg" });
    expect(two).toMatchObject({ p_evidence_id: "e1", p_evidence_id_2: "e2", p_storage_path_2: "u/2026-11-23/e2.jpg", p_submit: true });
    expect(buildJobSaveWithEvidenceRpcArgs({ ...job, evidenceId: "e1", storagePath: "p", dailyMinutes: 0, secondEvidenceId: "e2" })).not.toHaveProperty("p_evidence_id_2");
  });

  it("migration 0160 records the second proof before the job is submitted, checks its file, and drops the old signature first", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261123200000_0160_two_captures_with_job.sql", import.meta.url), "utf8");
    expect(sql.indexOf("drop function if exists public.save_own_job_with_overtime_evidence")).toBeLessThan(sql.indexOf("create or replace function"));
    expect(sql).toMatch(/p_evidence_id_2 uuid DEFAULT null, p_storage_path_2 text DEFAULT null/);
    expect(sql.indexOf("-- 2b.")).toBeGreaterThan(sql.indexOf("insert into public.overtime_evidence (id, job_id"));
    expect(sql.indexOf("-- 2b.")).toBeLessThan(sql.indexOf("-- 4. Submit"));
    expect(sql).toMatch(/o\.name = p_storage_path_2/);
    expect(sql).toMatch(/revoke all on function public\.save_own_job_with_overtime_evidence\(.*uuid, text\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.save_own_job_with_overtime_evidence\(.*uuid, text\) to authenticated/);
  });
});
