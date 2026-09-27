import { describe, expect, it, vi } from "vitest";
import { createBoundedFetch, DEFAULT_REQUEST_TIMEOUT_MS } from "./bounded-fetch";

function pendingFetch(_input, { signal }) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

describe("createBoundedFetch", () => {
  it("does not undercut the 60-second payroll export timeout", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(60_000);
  });
  it("aborts a request that never settles", async () => {
    vi.useFakeTimers();
    const fetch = createBoundedFetch({ timeoutMs: 1000, fetchImpl: pendingFetch });
    const request = fetch("https://example.test");
    const rejection = expect(request).rejects.toMatchObject({ name: "TimeoutError" });

    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    vi.useRealTimers();
  });

  it("preserves caller cancellation", async () => {
    const caller = new AbortController();
    const fetch = createBoundedFetch({ timeoutMs: 1000, fetchImpl: pendingFetch });
    const request = fetch("https://example.test", { signal: caller.signal });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });

    caller.abort(new DOMException("Cancelled", "AbortError"));
    await rejection;
  });

  it("clears its timer after a completed request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => new Response("ok"));
    const fetch = createBoundedFetch({ timeoutMs: 1000, fetchImpl });

    await expect(fetch("https://example.test")).resolves.toBeInstanceOf(Response);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
