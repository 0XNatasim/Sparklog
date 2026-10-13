import { describe, expect, it, vi } from "vitest";
vi.mock("../supabaseClient", () => ({ supabase: { auth: { refreshSession: vi.fn(async () => ({})) } } }));
import { createLatestRequest, isAbortError } from "./latest-request";
import { withRetry } from "./utils";

describe("createLatestRequest", () => {
  it("lets only the newest request apply, and aborts the older one", async () => {
    const latest = createLatestRequest();
    const applied = [];
    const slow = latest.begin();
    const fast = latest.begin();
    expect(slow.signal.aborted).toBe(true);
    // The newer answer arrives first, the older one afterwards.
    if (fast.isCurrent()) applied.push("new filter");
    if (slow.isCurrent()) applied.push("old filter");
    expect(applied).toEqual(["new filter"]);
  });

  it("marks a follow-up stale once a newer load begins", () => {
    const latest = createLatestRequest();
    latest.begin();
    const pageGeneration = latest.generation();
    latest.begin();
    expect(latest.generation()).not.toBe(pageGeneration);
  });

  it("cancel() invalidates the current ticket", () => {
    const latest = createLatestRequest();
    const ticket = latest.begin();
    latest.cancel();
    expect(ticket.isCurrent()).toBe(false);
    expect(ticket.signal.aborted).toBe(true);
  });
});

describe("isAbortError", () => {
  it("recognises thrown and supabase-shaped aborts only", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError({ message: "AbortError: signal is aborted without reason" })).toBe(true);
    expect(isAbortError({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("withRetry with an aborted signal", () => {
  it("does not retry a request whose filter was replaced", async () => {
    const controller = new AbortController();
    let calls = 0;
    const query = () => { calls += 1; controller.abort(); return Promise.resolve({ error: { message: "AbortError: aborted" } }); };
    await expect(withRetry(query, 1000, { signal: controller.signal, backoffMs: 1 })).rejects.toMatchObject({ message: "AbortError: aborted" });
    expect(calls).toBe(1);
  });
});
