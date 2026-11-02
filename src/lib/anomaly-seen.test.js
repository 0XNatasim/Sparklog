import { describe, expect, it } from "vitest";
import { readSeen, seenCount, seenId, seenStorageKey, unseenAnomalies } from "./anomaly-seen";

const reused = (others) => ({ key: "ot_reused:j1", type: "ot_reused", others: others.map((jobId) => ({ jobId })) });
const duplicate = { key: "duplicate:j2,j3", type: "duplicate" };

describe("« J'ai vu » on a check-before-approving alert", () => {
  it("hides only the alert that was marked", () => {
    const seen = { [seenId(duplicate)]: 1 };
    expect(unseenAnomalies([duplicate, reused(["j9"])], seen)).toEqual([reused(["j9"])]);
    expect(seenCount([duplicate, reused(["j9"])], seen)).toBe(1);
  });

  it("brings « OT déjà utilisé » back when another job uses the same OT", () => {
    const seen = { [seenId(reused(["j8"]))]: 1 };
    expect(unseenAnomalies([reused(["j8"])], seen)).toEqual([]);
    expect(unseenAnomalies([reused(["j8", "j9"])], seen)).toHaveLength(1);
    expect(seenId(reused(["j9", "j8"]))).toBe(seenId(reused(["j8", "j9"])));
  });

  it("reads the saved list, drops entries older than 90 days and survives bad storage", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const store = { getItem: () => JSON.stringify({ fresh: now - day, old: now - 91 * day, bad: "x" }) };
    expect(readSeen(store, "u1", now)).toEqual({ fresh: now - day });
    expect(readSeen({ getItem: () => "{not json" }, "u1", now)).toEqual({});
    expect(readSeen(null, "u1", now)).toEqual({});
  });

  it("keeps each manager's list apart", () => {
    expect(seenStorageKey("a")).not.toBe(seenStorageKey("b"));
  });
});
