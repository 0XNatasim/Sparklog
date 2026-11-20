import { describe, expect, it } from "vitest";
import { STATUS_KEYS, parseStatusParam, statusKey, toggleStatus } from "./status-filter";

describe("status-filter", () => {
  it("shows the four statuses by default and reads a list from the URL", () => {
    expect(parseStatusParam(null)).toEqual(STATUS_KEYS);
    expect(parseStatusParam("all")).toEqual(STATUS_KEYS);
    expect(parseStatusParam("updated,submitted")).toEqual(["updated", "submitted"]);
    expect(parseStatusParam("submitted")).toEqual(["submitted"]);
    expect(parseStatusParam("bogus,approved")).toEqual(["approved"]);
  });
  it("writes « all » for the four, the chosen ones otherwise", () => {
    expect(statusKey(STATUS_KEYS)).toBe("all");
    expect(statusKey(["submitted", "saved"])).toBe("saved,submitted");
  });
  it("toggles a status and keeps at least one", () => {
    expect(toggleStatus(STATUS_KEYS, "saved")).toEqual(["updated", "submitted", "approved"]);
    expect(toggleStatus(["submitted"], "submitted")).toEqual(["submitted"]);
    expect(toggleStatus(["submitted"], "saved")).toEqual(["saved", "submitted"]);
  });
});
