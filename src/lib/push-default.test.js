import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("@/supabaseClient", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() }, auth: {} } }));

const { isPushOptedOut, pushPromptMode, PUSH_PROMPT_SNOOZE_MS, setPushOptOut, snoozePushPrompt } = await import("@/lib/push");

function memoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("notifications on by default (V2.4.173)", () => {
  it("asks every account whose device has no subscription", () => {
    const store = memoryStore();
    expect(pushPromptMode("off", { userId: "u1", store })).toBe("ask");
    expect(pushPromptMode("needs-install", { userId: "u1", store })).toBe("install");
  });

  it("never asks when on, blocked, unsupported, unconfigured or signed out", () => {
    const store = memoryStore();
    for (const status of ["on", "denied", "unsupported", "unconfigured", null]) {
      expect(pushPromptMode(status, { userId: "u1", store })).toBeNull();
    }
    expect(pushPromptMode("off", { userId: null, store })).toBeNull();
  });

  it("« Plus tard » hides the card for 3 days", () => {
    const store = memoryStore();
    const now = Date.UTC(2026, 9, 23, 12);
    snoozePushPrompt(now, store);
    expect(pushPromptMode("off", { userId: "u1", now: now + 1000, store })).toBeNull();
    expect(pushPromptMode("off", { userId: "u1", now: now + PUSH_PROMPT_SNOOZE_MS + 1, store })).toBe("ask");
  });

  it("turning them off is remembered per account on the device, turning them on clears it", () => {
    const store = memoryStore();
    setPushOptOut("u1", true, store);
    expect(isPushOptedOut("u1", store)).toBe(true);
    expect(isPushOptedOut("u2", store)).toBe(false);
    expect(pushPromptMode("off", { userId: "u1", store })).toBeNull();
    expect(pushPromptMode("off", { userId: "u2", store })).toBe("ask");
    setPushOptOut("u1", false, store);
    expect(pushPromptMode("off", { userId: "u1", store })).toBe("ask");
  });

  it("broken storage never blocks the card", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(pushPromptMode("off", { userId: "u1", store: broken })).toBe("ask");
    expect(() => setPushOptOut("u1", true, broken)).not.toThrow();
  });

  it("the card is in both layouts (not in the manager's employee view) and Profile passes the account", () => {
    const shell = read("src/components/AppShell.jsx");
    expect(shell).toContain("{!isViewMode && <PushPrompt />}");
    expect(read("src/components/manager/ManagerLayout.jsx")).toContain("<PushPrompt />");
    const toggle = read("src/components/PushNotificationsToggle.jsx");
    expect(toggle).toContain("enablePush(user?.id)");
    expect(toggle).toContain("disablePush(user?.id)");
    const prompt = read("src/components/PushPrompt.jsx");
    expect(prompt).toContain("syncPushSubscription(userId)");
  });

  it("managers see who has notifications: ids only, manager level (aal2)", () => {
    const sql = read("supabase/migrations/20261023120000_0113_push_enabled_users.sql");
    expect(sql).toContain("security definer set search_path to ''");
    expect(sql).toContain("public.get_my_role() = 'manager'");
    expect(sql).toContain("revoke all on function public.push_enabled_users() from public, anon;");
    expect(read("src/components/EmployeesPanel.jsx")).toContain('supabase.rpc("push_enabled_users")');
  });
});
