// @vitest-environment jsdom
// The employee's message bell (refactored onto useEmployeeBroadcasts in V2.4.182): lists the messages,
// counts the unread ones, and opening one writes its « OK » once. Hidden for a manager account.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null, auth: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth, SESSION_RESUMED_EVENT: "sparklog:session-resumed" }));
vi.mock("@/lib/push-support", () => ({ setAppBadgeCount: vi.fn() }));
vi.mock("@/components/BroadcastAttachments", () => ({ default: () => null, EditedTag: () => null }));

const { default: EmployeeNotificationsBell } = await import("./EmployeeNotificationsBell");
const fr = (key) => dictionaries.fr[key];

const MESSAGES = [
  { broadcast_id: "b1", acknowledged_at: null, manager_broadcasts: { body: "Nouveau message", created_at: "2026-10-25T12:00:00Z", attachments: [] } },
  { broadcast_id: "b2", acknowledged_at: "2026-10-20T12:00:00Z", manager_broadcasts: { body: "Ancien message", created_at: "2026-10-19T12:00:00Z", attachments: [] } },
];

function setup(role = "employee") {
  state.auth = { user: { id: "emp" }, role };
  // A tiny table: an update (the « OK ») is applied, so the next read sees it, as in the database.
  const rows = MESSAGES.map((m) => ({ ...m }));
  const broadcastRecipients = (call) => {
    if (call.op === "update") {
      const id = call.filters.find(([, column]) => column === "broadcast_id")?.[2];
      for (const row of rows) if (row.broadcast_id === id) Object.assign(row, call.payload);
      return null;
    }
    return rows.map((row) => ({ ...row }));
  };
  state.fake = createFakeSupabase({ tables: { broadcast_recipients: broadcastRecipients } });
  return render(<EmployeeNotificationsBell />);
}

function openMenu(button) {
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.keyDown(button, { key: "Enter" });
}

afterEach(cleanup);

describe("EmployeeNotificationsBell", () => {
  it("shows the unread count and acknowledges a message once when opened", async () => {
    setup();
    const bell = screen.getByRole("button", { name: fr("notifications.employeeTitle") });
    await waitFor(() => expect(bell.textContent).toContain("1"));
    openMenu(bell);
    fireEvent.click(await screen.findByText("Nouveau message"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(state.fake.writes("broadcast_recipients")).toHaveLength(1));
    const [write] = state.fake.writes("broadcast_recipients");
    expect(write.op).toBe("update");
    expect(write.filters).toEqual([["eq", "broadcast_id", "b1"], ["eq", "employee_id", "emp"]]);
    await waitFor(() => expect(bell.textContent).not.toContain("1"));
  });

  it("does not write again for a message already read", async () => {
    setup();
    const bell = screen.getByRole("button", { name: fr("notifications.employeeTitle") });
    openMenu(bell);
    fireEvent.click(await screen.findByText("Ancien message"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(state.fake.writes("broadcast_recipients")).toHaveLength(0);
  });

  it("is hidden for a manager account", () => {
    setup("manager");
    expect(screen.queryByRole("button", { name: fr("notifications.employeeTitle") })).toBeNull();
    expect(state.fake.calls).toHaveLength(0);
  });
});
