// @vitest-environment jsdom
// The V3 single bell's manager feed (read marks, « Tout marquer comme lu ») and the « À traiter »
// counter (V2.4.182).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { useManagerNotifications, notificationTarget, notificationTargetV3 } = await import("./use-manager-notifications");
const { fetchTodoCount } = await import("./todo-count");

afterEach(cleanup);

describe("manager notifications of the bell", () => {
  it("lists only the unread ones and marks them all read in one write", async () => {
    state.fake = createFakeSupabase({
      tables: {
        manager_notifications: [
          { id: "n1", type: "meal_claim", employee_id: "e1", job_id: "j1", created_at: "2026-10-25T12:00:00Z" },
          { id: "n2", type: "overtime", employee_id: "e1", job_id: "j2", daily_minutes: 600, created_at: "2026-10-25T11:00:00Z" },
          { id: "n3", type: "parking_receipt", employee_id: "e1", created_at: "2026-10-24T11:00:00Z" },
        ],
        manager_notification_reads: (call) => (call.op === "select" ? [{ notification_id: "n3" }] : { data: null, error: null }),
        profiles: [{ id: "e1", full_name: "Zoé" }],
      },
    });
    const { result } = renderHook(() => useManagerNotifications(true, "me"));
    await waitFor(() => expect(result.current.unread).toBe(2));
    expect(result.current.visible.map((n) => [n.id, n.employeeName])).toEqual([["n1", "Zoé"], ["n2", "Zoé"]]);
    await act(() => result.current.markRead(result.current.visible));
    expect(state.fake.writes("manager_notification_reads")).toHaveLength(1);
    expect(state.fake.writes("manager_notification_reads")[0].payload).toEqual([
      { notification_id: "n1", manager_id: "me" },
      { notification_id: "n2", manager_id: "me" },
    ]);
    expect(result.current.unread).toBe(0);
  });

  it("reads nothing when the person may not see them", () => {
    state.fake = createFakeSupabase();
    const { result } = renderHook(() => useManagerNotifications(false, "me"));
    expect(result.current.unread).toBe(0);
    expect(state.fake.calls).toHaveLength(0);
  });

  it("opens the same page as before for each kind", () => {
    expect(notificationTarget({ type: "meal_claim", job_id: "j1" })).toBe("/manager/receipts?filter=meals&job=j1");
    expect(notificationTarget({ type: "parking_receipt" })).toBe("/manager/receipts?filter=parking");
    expect(notificationTarget({ type: "ccq_renewal" })).toBe("/manager/employees");
    expect(notificationTarget({ type: "overtime", job_id: "j2" })).toBe("/manager/receipts?filter=overtime&job=j2");
    // The V3 bell opens the same page in V3 (V2.4.183).
    expect(notificationTargetV3({ type: "meal_claim", job_id: "j1" })).toBe("/manager/todo?filter=meals&job=j1&tab=receipts");
    expect(notificationTargetV3({ type: "ccq_renewal" })).toBe("/manager/v3/team?tab=employees");
  });
});

describe("« À traiter » counter", () => {
  it("counts the submitted jobs after the weeks paid by Dynacom, without reading rows", async () => {
    state.fake = createFakeSupabase({ tables: { jobs: { data: null, count: 7, error: null } } });
    expect(await fetchTodoCount()).toBe(7);
    const [call] = state.fake.calls;
    expect(call).toMatchObject({ table: "jobs", op: "select", columns: "id" });
    expect(call.filters).toEqual([["eq", "status", "submitted"], ["gt", "job_date", "2026-10-10"]]);
  });
});
