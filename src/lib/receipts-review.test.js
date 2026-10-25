import { describe, expect, it } from "vitest";
import { filterReceiptJobs, receiptEmployees, receiptNeedsReview } from "./receipts-review";

describe("receiptNeedsReview", () => {
  it("is to process while a claim is pending or an overtime proof waits for the job's approval", () => {
    expect(receiptNeedsReview({ status: "approved" }, { parkingStatus: "pending" })).toBe(true);
    expect(receiptNeedsReview({ status: "approved" }, { mealStatus: "pending" })).toBe(true);
    expect(receiptNeedsReview({ status: "submitted" }, { hasOvertimeProof: true })).toBe(true);
    expect(receiptNeedsReview({ status: "approved" }, { hasOvertimeProof: true })).toBe(false);
    expect(receiptNeedsReview({ status: "submitted" }, { parkingStatus: "approved", mealStatus: "rejected" })).toBe(false);
    expect(receiptNeedsReview({ status: "submitted" })).toBe(false);
  });
});

describe("filterReceiptJobs", () => {
  const jobs = [
    { id: "a", user_id: "u1", job_date: "2026-10-20", status: "submitted" },
    { id: "b", user_id: "u1", job_date: "2026-10-21", status: "approved" },
    { id: "c", user_id: "u2", job_date: "2026-10-21", status: "approved" },
  ];
  const statuses = { a: { hasOvertimeProof: true }, b: { parkingStatus: "approved" }, c: { mealStatus: "pending" } };
  const status = (job) => statuses[job.id];

  it("keeps only what is left to process by default", () => {
    expect(filterReceiptJobs(jobs, { status }).map((j) => j.id)).toEqual(["a", "c"]);
    expect(filterReceiptJobs(jobs, { pendingOnly: false, status }).map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by employee and by date", () => {
    expect(filterReceiptJobs(jobs, { pendingOnly: false, employeeId: "u1", status }).map((j) => j.id)).toEqual(["a", "b"]);
    expect(filterReceiptJobs(jobs, { pendingOnly: false, date: "2026-10-21", status }).map((j) => j.id)).toEqual(["b", "c"]);
    expect(filterReceiptJobs(jobs, { employeeId: "u1", date: "2026-10-21", status })).toEqual([]);
  });

  it("lists the employees of the jobs by name", () => {
    const profiles = new Map([["u1", { full_name: "Zoé" }], ["u2", { email: "alex@x.ca" }]]);
    expect(receiptEmployees(jobs, profiles)).toEqual([{ id: "u2", name: "alex@x.ca" }, { id: "u1", name: "Zoé" }]);
  });
});
