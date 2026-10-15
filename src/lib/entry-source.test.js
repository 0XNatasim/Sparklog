import { describe, expect, it } from "vitest";
import { onlyManualEntries } from "./entry-source";

describe("onlyManualEntries", () => {
  const jobs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("keeps the list as is when the filter is off", () => {
    expect(onlyManualEntries(jobs, new Set(["b"]), false)).toBe(jobs);
  });
  it("keeps only the jobs entered by hand when it is on", () => {
    expect(onlyManualEntries(jobs, new Set(["b", "z"]), true)).toEqual([{ id: "b" }]);
    expect(onlyManualEntries(jobs, new Set(), true)).toEqual([]);
  });
});
