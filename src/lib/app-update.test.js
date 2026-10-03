import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./app-update";

describe("isNewerVersion", () => {
  it("detects only strictly newer dotted versions", () => {
    expect(isNewerVersion("2.4.36", "2.4.35")).toBe(true);
    expect(isNewerVersion("2.5.0", "2.4.99")).toBe(true);
    expect(isNewerVersion("2.4.35", "2.4.35")).toBe(false);
    expect(isNewerVersion("2.4.34", "2.4.35")).toBe(false);
    expect(isNewerVersion("", "2.4.35")).toBe(false);
    expect(isNewerVersion("<!doctype", "2.4.35")).toBe(false);
  });
});
