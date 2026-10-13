import { describe, expect, it } from "vitest";
import { classifyApiError } from "./api-errors";

describe("classifyApiError", () => {
  it.each([
    [{ status: 401, message: "Unauthorized" }, "auth"],
    [{ code: "PGRST301", message: "JWT expired" }, "auth"],
    [{ message: "JWT expired" }, "auth"],
    [{ status: 503, message: "Service Unavailable" }, "transient"],
    [{ status: 429, message: "Too many requests" }, "transient"],
    [{ code: "57014", message: "canceling statement due to statement timeout" }, "transient"],
    [{ code: "40001", message: "could not serialize access" }, "transient"],
    [new TypeError("Failed to fetch"), "transient"],
    [{ name: "TimeoutError", message: "Request timed out after 12s" }, "transient"],
    [{ status: 0, code: "", message: "FetchError: network down" }, "transient"],
    [{ status: 400, code: "23514", message: "overtime_evidence_required" }, "permanent"],
    [{ code: "23P01", message: "overlapping_job_interval" }, "permanent"],
    [{ status: 403, code: "42501", message: "job_write_not_allowed" }, "permanent"],
    [{ code: "55000", message: "job_not_editable" }, "permanent"],
    [{ status: 404, code: "PGRST202", message: "Could not find the function" }, "permanent"],
    [new Error("invalid_job_contract:depart"), "unknown"],
    [null, "unknown"],
  ])("%j → %s", (error, kind) => {
    expect(classifyApiError(error)).toBe(kind);
  });
});
