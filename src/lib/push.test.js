import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPushPayload, isGonePushStatus, truncate } from "../../supabase/functions/send_push/push_payload.js";
import { setAppBadgeCount, urlBase64ToUint8Array } from "./push-support";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("push payload (shared with the send_push Edge Function)", () => {
  it("builds a compact JSON payload the service worker can read", () => {
    const payload = JSON.parse(buildPushPayload({ title: "SparkLog", body: "  Réunion\n demain  ", url: "/week", tag: "b-1" }));
    expect(payload).toEqual({ title: "SparkLog", body: "Réunion demain", url: "/week", tag: "b-1" });
  });

  it("truncates long bodies and refuses off-site URLs", () => {
    const long = buildPushPayload({ body: "x".repeat(500), url: "https://evil.example" });
    const payload = JSON.parse(long);
    expect([...payload.body]).toHaveLength(140);
    expect(payload.body.endsWith("…")).toBe(true);
    expect(payload.url).toBe("/");
    expect(truncate("é".repeat(10), 5)).toBe("éééé…");
  });

  it("treats only 404/410 as a dead subscription", () => {
    expect([404, 410].every(isGonePushStatus)).toBe(true);
    expect([200, 201, 400, 401, 403, 413, 429, 500, 503].some(isGonePushStatus)).toBe(false);
  });
});

describe("app icon badge", () => {
  it("puts the unread count in the payload, clamped and validated", () => {
    expect(JSON.parse(buildPushPayload({ body: "x", badge: 3 })).badge).toBe(3);
    expect(JSON.parse(buildPushPayload({ body: "x", badge: 5000 })).badge).toBe(999);
    expect(JSON.parse(buildPushPayload({ body: "x", badge: -1 })).badge).toBeUndefined();
    expect(JSON.parse(buildPushPayload({ body: "x", badge: "2" })).badge).toBeUndefined();
  });

  it("sets or clears the badge, and is a no-op without the Badging API", async () => {
    const calls = [];
    const nav = { setAppBadge: (n) => { calls.push(["set", n]); return Promise.resolve(); }, clearAppBadge: () => { calls.push(["clear"]); return Promise.resolve(); } };
    await setAppBadgeCount(4, nav);
    await setAppBadgeCount(0, nav);
    await setAppBadgeCount(2000, nav);
    expect(calls).toEqual([["set", 4], ["clear"], ["set", 999]]);
    await expect(setAppBadgeCount(1, {})).resolves.toBeUndefined();
    await expect(setAppBadgeCount(1, { setAppBadge: () => Promise.reject(new Error("no")) })).resolves.toBeUndefined();
  });
});

describe("browser helpers", () => {
  it("decodes a URL-safe base64 VAPID key", () => {
    const bytes = urlBase64ToUint8Array("AQID_-8"); // 01 02 03 ff ef
    expect([...bytes]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("push wiring invariants", () => {
  const migration = read("../../supabase/migrations/20261008150000_0074_push_subscriptions.sql");

  it("only lets a user read/delete their own subscriptions and writes via the RPC", () => {
    expect(migration).toMatch(/enable row level security/);
    expect(migration).toMatch(/for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(migration).toMatch(/for delete to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(migration).not.toMatch(/for (insert|update|all)\b/i);
    expect(migration).toMatch(/revoke all on function public\.register_push_subscription[\s\S]*from public, anon/);
    expect(migration).toMatch(/is_active_employee\(\)/);
  });

  it("send_push requires a manager and a broadcast the caller sent", () => {
    const fn = read("../../supabase/functions/send_push/index.ts");
    expect(fn).toMatch(/\["manager", "admin", "owner"\]\.includes/);
    expect(fn).toMatch(/broadcast\.sender_id !== callerUser\.user\.id/);
    expect(fn).toMatch(/AbortSignal\.timeout/);
  });

  it("the service worker imports the push handlers", () => {
    expect(read("../../vite.config.js")).toMatch(/importScripts: \["push-sw\.js"\]/);
    expect(read("../../public/push-sw.js")).toMatch(/addEventListener\("push"[\s\S]*addEventListener\("notificationclick"/);
  });
});
