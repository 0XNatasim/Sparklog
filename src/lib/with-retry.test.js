import { describe, expect, it, vi } from "vitest";
vi.mock("../supabaseClient", () => ({ supabase: { auth: { refreshSession: vi.fn(async () => ({})) } } }));
import { withRetry } from "./utils";

function counting(result) {
  let calls = 0;
  const query = () => { calls += 1; return Promise.resolve(result); };
  return { query, calls: () => calls };
}

describe("withRetry error classes", () => {
  it("throws a server refusal at once (no retry)", async () => {
    const q = counting({ error: { code: "23P01", message: "overlapping_job_interval" }, status: 409 });
    await expect(withRetry(q.query, 1000, { backoffMs: 1 })).rejects.toMatchObject({ message: "overlapping_job_interval", status: 409 });
    expect(q.calls()).toBe(1);
  });

  it("retries a transient failure, then gives up", async () => {
    const q = counting({ error: { message: "Service Unavailable" }, status: 503 });
    await expect(withRetry(q.query, 1000, { backoffMs: 1 })).rejects.toMatchObject({ status: 503 });
    expect(q.calls()).toBe(3);
  });

  it("returns the first success after a transient failure", async () => {
    let calls = 0;
    const query = () => Promise.resolve(++calls === 1 ? { error: { message: "Bad gateway" }, status: 502 } : { data: { id: 1 }, error: null });
    await expect(withRetry(query, 1000, { backoffMs: 1 })).resolves.toMatchObject({ data: { id: 1 } });
    expect(calls).toBe(2);
  });
});
