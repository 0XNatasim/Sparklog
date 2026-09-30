import { describe, expect, it } from "vitest";
import { findJobOverlap, jobOverlapDetails, jobOverlapMessage } from "./job-overlap";

const candidate = { id: "draft", ot: "100", job_date: "2026-09-29", depart: "10:00", fin: "14:00", status: "saved" };

describe("job overlap details", () => {
  it("identifies both jobs and the exact shared time range", () => {
    const other = { id: "submitted", ot: "200", job_date: "2026-09-29", depart: "13:15", fin: "16:00", status: "submitted" };
    expect(findJobOverlap(candidate, [candidate, other])).toMatchObject({
      candidate,
      other,
      overlapStart: "13:15",
      overlapEnd: "14:00",
    });
  });

  it("does not report adjacent jobs", () => {
    expect(findJobOverlap(candidate, [
      { id: "adjacent", job_date: "2026-09-29", depart: "14:00", fin: "15:00", status: "approved" },
    ])).toBeNull();
  });

  it("warns about a conflicting saved or updated draft", () => {
    const saved = { id: "draft-2", ot: "300", job_date: "2026-09-29", depart: "12:00", fin: "13:00", status: "saved" };
    const t = (key, values) => `${key}:${values.secondOt}`;
    expect(jobOverlapDetails(candidate, [saved], t)).toBe("form.errors.overlappingIntervalDetails:300");
  });

  it("builds a translated message only for an overlap database error", () => {
    const other = { id: "approved", ot: "200", job_date: "2026-09-29", depart: "13:00", fin: "15:00", status: "approved" };
    const t = (key, values) => `${key}:${JSON.stringify(values)}`;
    expect(jobOverlapMessage({ message: "overlapping_job_interval" }, candidate, [other], t))
      .toContain('"firstOt":"100"');
    expect(jobOverlapMessage({ message: "invalid_job_interval" }, candidate, [other], t)).toBeNull();
  });
});
