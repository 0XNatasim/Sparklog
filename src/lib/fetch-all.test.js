import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";

// A fake query builder over `total` rows that honours .range() like PostgREST, capped at
// `maxRows` per request.
function fakeTable(total, { maxRows = 1000, failAt = null } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls = [];
  const makeQuery = () => ({
    range(from, to) {
      calls.push([from, to]);
      if (failAt != null && from >= failAt) return Promise.resolve({ data: null, error: { message: "boom" } });
      return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + maxRows)), error: null });
    },
  });
  return { makeQuery, calls };
}

describe("fetchAllRows", () => {
  it("reads every page past the 1000-row cap", async () => {
    const t = fakeTable(2345);
    const { data, error } = await fetchAllRows(t.makeQuery);
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one request for a small set", async () => {
    const t = fakeTable(12);
    const { data } = await fetchAllRows(t.makeQuery);
    expect(data).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });

  it("asks one more page when the count is an exact multiple", async () => {
    const t = fakeTable(1000);
    const { data } = await fetchAllRows(t.makeQuery);
    expect(data).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it("returns the error of a failed page instead of a partial total", async () => {
    const t = fakeTable(2500, { failAt: 1000 });
    const result = await fetchAllRows(t.makeQuery);
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ message: "boom" });
  });
});
