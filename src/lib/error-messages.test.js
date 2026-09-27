import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyErrorMessage, isNetworkError, isOfflineError } from "./error-messages";

const t = (key) => `t:${key}`;

function setOnline(value) {
  vi.stubGlobal("navigator", { onLine: value });
}

afterEach(() => vi.unstubAllGlobals());

describe("friendlyErrorMessage", () => {
  it("translates job-contract codes instead of showing them raw", () => {
    setOnline(true);
    expect(friendlyErrorMessage({ message: "overlapping_job_interval" }, t, "fallback"))
      .toBe("t:form.errors.overlappingInterval");
    expect(friendlyErrorMessage({ message: "invalid_job_kilometres" }, t, "fallback"))
      .toBe("t:form.errors.invalidKilometres");
    expect(friendlyErrorMessage({ message: "The entry deadline for this work date has passed" }, t, "fallback"))
      .toBe("t:form.errors.dayClosed");
  });

  it("shows the offline sentence, never the fetch TypeError, when the device is offline", () => {
    setOnline(false);
    const error = new TypeError("Failed to fetch");
    expect(isOfflineError(error)).toBe(true);
    expect(friendlyErrorMessage(error, t, "fallback")).toBe("t:offline.banner");
  });

  it("uses a network sentence for online connection failures and timeouts", () => {
    setOnline(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(friendlyErrorMessage(new DOMException("Request timed out after 75s", "TimeoutError"), t, "fallback"))
      .toBe("t:common.errors.network");
  });

  it("falls back to the screen's own sentence for unknown errors", () => {
    setOnline(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyErrorMessage({ message: "some internal detail" }, t, "history.errors.submitFailed"))
      .toBe("t:history.errors.submitFailed");
  });
});
