// supabase/functions/send_push/index.ts
//
// Web Push (RFC 8030 + VAPID) for employees' phones — Android and iOS 16.4+ (installed PWA).
// Called by the manager UI right after a broadcast is created:
//   POST { broadcastId: string }   (manager/admin/owner bearer token)
// and after an edit that asks the readers to read it again (migration 0107):
//   POST { broadcastId: string, reread: true }   → only recipients who have not pressed OK,
//   body prefixed « Message modifié : ».
// Recipients are read from broadcast_recipients server-side; the client never supplies them.
// Withdrawn recipients (0107) never get a push.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL).
// Generate once with `npx web-push generate-vapid-keys`. Without them this returns 503 and
// the broadcast itself is unaffected (push is best-effort on top of the in-app bell).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildPushPayload, canPushBroadcast, isGonePushStatus, pushBodyFor } from "./push_payload.js";
import { isAal2 } from "../_shared/mfa.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PUSH_TIMEOUT_MS = 10_000;
const MAX_SUBSCRIPTIONS = 2000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Vapid = { subject: string; publicKey: string; privateKey: string };

// Sends the phone push of one broadcast to its recipients (or, with `reread`, to those who have not pressed OK).
// A scheduled message whose time has not come is never pushed. Shared by the manager's call and the scheduled task.
async function deliver(admin: ReturnType<typeof createClient>, vapid: Vapid, broadcast: { id: string; body: string; scheduled_for?: string | null }, reread: boolean): Promise<{ ok: boolean; error?: string; sent?: number; failed?: number; removed?: number }> {
  const broadcastId = broadcast.id;
  if (broadcast.scheduled_for && new Date(broadcast.scheduled_for).getTime() > Date.now()) return { ok: false, error: "scheduled_not_due" };
  const vapidSubject = vapid.subject, vapidPublic = vapid.publicKey, vapidPrivate = vapid.privateKey;
  let recipientQuery = admin
    .from("broadcast_recipients").select("employee_id").eq("broadcast_id", broadcastId).is("withdrawn_at", null);
  if (reread) recipientQuery = recipientQuery.is("acknowledged_at", null);
  const { data: recipients } = await recipientQuery;
  const employeeIds = (recipients ?? []).map((r) => r.employee_id);
  if (employeeIds.length === 0) return { ok: true, sent: 0, failed: 0, removed: 0 };

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", employeeIds).limit(MAX_SUBSCRIPTIONS);
  if (subsErr) return { ok: false, error: subsErr.message };

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  // Unread announcements per employee (this one included) → number on the app icon.
  const { data: unreadRows } = await admin
    .from("broadcast_recipients").select("employee_id, broadcast_id")
    .in("employee_id", employeeIds).is("acknowledged_at", null).is("withdrawn_at", null);
  const unread = new Map<string, number>();
  // A message still waiting for its time is not unread yet: it does not count on the app icon.
  const waiting = new Set<string>();
  const unreadIds = [...new Set((unreadRows ?? []).map((row: { broadcast_id: string }) => row.broadcast_id))];
  if (unreadIds.length > 0) {
    const { data: future } = await admin.from("manager_broadcasts").select("id").in("id", unreadIds).gt("scheduled_for", new Date().toISOString());
    for (const row of future ?? []) waiting.add(row.id);
  }
  for (const row of unreadRows ?? []) {
    if (waiting.has(row.broadcast_id)) continue;
    unread.set(row.employee_id, (unread.get(row.employee_id) ?? 0) + 1);
  }

  let sent = 0, failed = 0;
  const gone: string[] = [];
  // generateRequestDetails builds the encrypted request; we send it with fetch() so the
  // call is bounded by an AbortSignal and does not depend on Node's https module.
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      const message = buildPushPayload({
        title: "SparkLog", body: pushBodyFor(broadcast.body, { reread }), url: "/", tag: `broadcast-${broadcastId}`,
        badge: Math.max(1, unread.get(sub.user_id) ?? 1),
      });
      const d = await webpush.generateRequestDetails(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
      const res = await fetch(d.endpoint, {
        method: d.method, headers: d.headers, body: d.body, signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      await res.body?.cancel();
      if (res.ok) sent++;
      else { failed++; if (isGonePushStatus(res.status)) gone.push(sub.id); }
    } catch (e) {
      failed++;
      console.warn("[send_push] delivery failed:", e instanceof Error ? e.message : String(e));
    }
  }));

  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
  return { ok: true, sent, failed, removed: gone.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);
    if (!vapidPublic || !vapidPrivate || !vapidSubject) return json({ ok: false, error: "push_not_configured" }, 503);

    // The scheduled task (pg_cron, migration 0163): every minute it asks for the scheduled messages whose time has come.
    if (req.headers.get("x-cron-secret")) {
      const cronAdmin = createClient(supabaseUrl, serviceRole);
      const { data: allowed } = await cronAdmin.rpc("verify_cron_secret", { p_secret: req.headers.get("x-cron-secret") });
      if (allowed !== true) return json({ ok: false, error: "Unauthorized" }, 401);
      const { data: claimed, error: claimError } = await cronAdmin.rpc("claim_due_broadcasts");
      if (claimError) return json({ ok: false, error: claimError.message }, 500);
      const vapid = { subject: vapidSubject, publicKey: vapidPublic, privateKey: vapidPrivate };
      let sent = 0, failed = 0, messages = 0;
      for (const row of claimed ?? []) {
        const { data: due } = await cronAdmin.from("manager_broadcasts").select("id, body, scheduled_for").eq("id", row.broadcast_id).maybeSingle();
        if (!due) continue;
        const result = await deliver(cronAdmin, vapid, due, false);
        messages++;
        if (result.ok) { sent += result.sent ?? 0; failed += result.failed ?? 0; }
      }
      return json({ ok: true, messages, sent, failed });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: callerUser, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser?.user) return json({ ok: false, error: "Invalid session token" }, 401);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", callerUser.user.id).maybeSingle();
    if (!profile || !["manager", "admin", "owner"].includes(profile.role)) {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }
    // Two-factor authentication (0103): a manager password alone is not enough.
    if (!isAal2(token)) return json({ ok: false, error: "mfa_required" }, 403);

    const payload = await req.json().catch(() => ({}));
    const broadcastId = typeof payload?.broadcastId === "string" ? payload.broadcastId : "";
    if (!/^[0-9a-f-]{36}$/i.test(broadcastId)) return json({ ok: false, error: "broadcastId is required" }, 400);
    const reread = payload?.reread === true;

    const { data: broadcast } = await admin
      .from("manager_broadcasts").select("id, body, sender_id, edited_by, scheduled_for").eq("id", broadcastId).maybeSingle();
    if (!broadcast) return json({ ok: false, error: "Broadcast not found" }, 404);
    // A manager may only push their own broadcasts, or their own edit of one (prevents replaying someone else's).
    if (!canPushBroadcast(broadcast, callerUser.user.id, { reread })) return json({ ok: false, error: "Forbidden" }, 403);

    const result = await deliver(admin, { subject: vapidSubject, publicKey: vapidPublic, privateKey: vapidPrivate }, broadcast, reread);
    if (!result.ok) return json(result, result.error === "scheduled_not_due" ? 409 : 500);
    return json(result);
  } catch (e) {
    console.error("[send_push] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
