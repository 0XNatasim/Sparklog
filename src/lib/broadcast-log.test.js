import { describe, expect, it } from "vitest";
import { fetchBroadcastLog } from "./broadcast-log";

// A table that, like PostgREST, answers at most 1 000 rows per request and honours .range().
function table(rows, { failScheduledColumn = false } = {}) {
  const query = { rows, from: 0, to: 999, columns: "" };
  const api = {
    select(columns) { query.columns = columns; return api; },
    order() { return api; },
    range(from, to) { query.from = from; query.to = Math.min(to, from + 999); return api; },
    then(resolve) {
      if (failScheduledColumn && /scheduled_for/.test(query.columns)) return resolve({ data: null, error: { message: "column scheduled_for does not exist" } });
      return resolve({ data: query.rows.slice(query.from, query.to + 1), error: null });
    },
  };
  return api;
}

const recipientRows = (n) => Array.from({ length: n }, (_, i) => ({ broadcast_id: `b${Math.floor(i / 30)}`, employee_id: `e${i}`, acknowledged_at: i % 2 ? "2026-11-26T12:00:00Z" : null, withdrawn_at: null }));

describe("fetchBroadcastLog", () => {
  it("reads every recipient row, past the 1 000 rows a single request returns", async () => {
    const client = { from: (name) => (name === "broadcast_recipients" ? table(recipientRows(1737)) : table([{ id: "b0" }])) };
    const [log, recipients] = await fetchBroadcastLog(client);
    expect(log.data).toHaveLength(1);
    expect(recipients.error).toBeNull();
    expect(recipients.data).toHaveLength(1737);
    // the readings of the newest messages (the rows a single request dropped) are there
    expect(recipients.data.filter((row) => row.broadcast_id === "b57" && row.acknowledged_at).length).toBeGreaterThan(0);
  });

  it("falls back to the list without scheduled_for before migration 0163", async () => {
    const client = { from: (name) => (name === "broadcast_recipients" ? table([]) : table([{ id: "b0" }], { failScheduledColumn: true })) };
    const [log] = await fetchBroadcastLog(client);
    expect(log.error).toBeNull();
    expect(log.data).toEqual([{ id: "b0" }]);
  });
});
