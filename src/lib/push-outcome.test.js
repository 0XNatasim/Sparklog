import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const refreshSession = vi.fn(async () => ({ data: {}, error: null }));
vi.mock("@/supabaseClient", () => ({ supabase: { functions: { invoke }, auth: { refreshSession } } }));

const { notifyBroadcastPush, pushFailureReason, pushOutcome } = await import("./push");

const refused = (status, error) => ({ data: null, error: { context: { status, json: async () => ({ ok: false, error }) } } });
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

beforeEach(() => {
  invoke.mockReset();
  refreshSession.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("phone push outcome (V2.4.172)", () => {
  it("names why send_push refused", () => {
    expect(pushFailureReason(401, "Invalid session token")).toBe("session");
    expect(pushFailureReason(403, "mfa_required")).toBe("session");
    expect(pushFailureReason(503, "push_not_configured")).toBe("not_configured");
    expect(pushFailureReason(403, "Forbidden")).toBe("error");
    expect(pushFailureReason(500, "")).toBe("error");
  });

  it("reports how many phones got it", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, sent: 2, failed: 0, removed: 0 }, error: null });
    expect(await notifyBroadcastPush("b1")).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(invoke).toHaveBeenCalledWith("send_push", { body: { broadcastId: "b1" } });
  });

  it("refreshes a refused session once and tries again", async () => {
    invoke.mockResolvedValueOnce(refused(401, "Invalid session token"))
      .mockResolvedValueOnce({ data: { ok: true, sent: 1, failed: 0 }, error: null });
    expect(await notifyBroadcastPush("b1", { reread: true })).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith("send_push", { body: { broadcastId: "b1", reread: true } });
  });

  it("says the session is closed when it still fails (the 2026-10-22 test), and never throws", async () => {
    invoke.mockResolvedValue(refused(401, "Invalid session token"));
    expect(await notifyBroadcastPush("b1")).toEqual({ ok: false, reason: "session" });
    invoke.mockReset();
    invoke.mockResolvedValueOnce(refused(503, "push_not_configured"));
    expect(await notifyBroadcastPush("b1")).toEqual({ ok: false, reason: "not_configured" });
    expect(invoke).toHaveBeenCalledTimes(1); // no retry for a server-side setting
    invoke.mockReset();
    invoke.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await notifyBroadcastPush("b1")).toEqual({ ok: false, reason: "error" });
  });

  it("turns the result into a message for the manager", () => {
    expect(pushOutcome({ ok: true, sent: 3, failed: 0 })).toEqual({ tone: "ok", key: "push.outcome.sent", params: { count: 3 } });
    expect(pushOutcome({ ok: true, sent: 0, failed: 0 }).key).toBe("push.outcome.noPhone");
    expect(pushOutcome({ ok: true, sent: 1, failed: 2 })).toEqual({ tone: "warning", key: "push.outcome.partial", params: { sent: 1, failed: 2 } });
    expect(pushOutcome({ ok: false, reason: "session" })).toEqual({ tone: "warning", key: "push.outcome.session", params: {} });
    expect(pushOutcome(null)).toBeNull();
  });

  it("signs out this device only, keeps the global sign-out after a password change, and shows every push outcome", () => {
    const auth = read("../contexts/AuthProvider.jsx");
    expect(auth).toContain('supabase.auth.signOut({ scope: "local" }),');
    expect(auth).not.toMatch(/supabase\.auth\.signOut\(\)/);
    // A new password must still close every other session.
    expect(read("../pages/ResetPassword.jsx")).toMatch(/withTimeout\(supabase\.auth\.signOut\(\), 8000\)/);
    for (const file of ["../components/BroadcastManager.jsx", "../components/BroadcastEditForm.jsx", "../components/manager/TodoInbox.jsx", "../components/EmergencyTimesheet.jsx"]) {
      const src = read(file);
      expect(src, file).toContain("pushOutcome(");
      expect(src, file).not.toMatch(/notifyBroadcastPush\([^)]*\);\s*\/\/ phone push, best-effort/);
    }
  });
});
