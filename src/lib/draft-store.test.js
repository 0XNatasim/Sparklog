import { describe, expect, it } from "vitest";
import {
  DRAFT_SCHEMA_VERSION,
  DRAFT_TTL_MS,
  draftKey,
  isUsableDraft,
  prepareDraftRecord,
} from "./draft-store";

describe("local draft contract", () => {
  it("isolates new and edited drafts by owner", () => {
    expect(draftKey("employee-a")).toBe("employee-a:new");
    expect(draftKey("employee-a", "job-1")).toBe("employee-a:edit:job-1");
    expect(draftKey("employee-b", "job-1")).not.toBe(draftKey("employee-a", "job-1"));
  });

  it("persists schema, idempotency key and a finite expiry", () => {
    const now = Date.UTC(2026, 8, 26);
    const record = prepareDraftRecord({
      userId: "employee-a",
      submissionKey: "submission-1",
      data: { ot: "1234" },
      now,
    });
    expect(record.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
    expect(record.submissionKey).toBe("submission-1");
    expect(Date.parse(record.expiresAt) - now).toBe(DRAFT_TTL_MS);
  });

  it("rejects expired, foreign and old-schema drafts", () => {
    const now = Date.UTC(2026, 8, 26);
    const record = prepareDraftRecord({ userId: "employee-a", data: {}, now });
    expect(isUsableDraft(record, { userId: "employee-a", now })).toBe(true);
    expect(isUsableDraft(record, { userId: "employee-b", now })).toBe(false);
    expect(isUsableDraft(record, { userId: "employee-a", now: now + DRAFT_TTL_MS + 1 })).toBe(false);
    expect(isUsableDraft({ ...record, schemaVersion: 0 }, { userId: "employee-a", now })).toBe(false);
  });
});

