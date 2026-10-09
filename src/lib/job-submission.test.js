import { describe, expect, it } from "vitest";
import { buildJobSaveRpcArgs, dailyOvertimeEvidenceRequirement, kilometreFieldValue, requiresEvidenceBeforeSave } from "./job-submission";

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
    ])).toEqual({ totalMinutes: 576, required: true });
  });

  it("accepts one proof anywhere on the day and ignores unrelated jobs", () => {
    expect(dailyOvertimeEvidenceRequirement(candidate, [
      { id: "a", job_date: "2026-09-29", depart: "08:00", fin: "13:00", status: "submitted", overtime_evidence_captured: true },
      { id: "other-day", job_date: "2026-09-28", depart: "00:00", fin: "12:00", status: "submitted" },
    ])).toEqual({ totalMinutes: 576, required: false });
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
