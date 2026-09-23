import { describe, expect, it } from "vitest";
import { isManagerRole, isNonCcqRole, isSubcontractorRole } from "./roles";

describe("subcontractor role", () => {
  it("is a non-CCQ, non-manager role", () => {
    expect(isSubcontractorRole("subcontractor_1")).toBe(true);
    expect(isNonCcqRole("subcontractor_1")).toBe(true);
    expect(isManagerRole("subcontractor_1")).toBe(false);
  });

  it("does not change the treatment of a regular employee", () => {
    expect(isSubcontractorRole("employee")).toBe(false);
    expect(isNonCcqRole("employee")).toBe(false);
  });
});
