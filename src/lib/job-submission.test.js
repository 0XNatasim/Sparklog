import { describe, expect, it } from "vitest";
import { buildJobSaveRpcArgs } from "./job-submission";

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

