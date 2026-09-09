import { describe, expect, it } from "vitest";
import { wasSingleJobExported } from "./approval";

describe("wasSingleJobExported", () => {
  it("accepts only an explicit single exported row", () => {
    expect(wasSingleJobExported({ exported: 1, skipped: 0 })).toBe(true);
    expect(wasSingleJobExported({ exported: "1", skipped: 0 })).toBe(true);
  });

  it("does not treat skipped or concurrently claimed jobs as exported", () => {
    expect(wasSingleJobExported({ exported: 0, skipped: 1 })).toBe(false);
    expect(wasSingleJobExported({ exported: 0, note: "already_claimed" })).toBe(false);
    expect(wasSingleJobExported({ skipped: 1 })).toBe(false);
  });
});
