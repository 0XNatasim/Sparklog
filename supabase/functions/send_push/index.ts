// supabase/functions/send_push/index.ts
//
// Web Push (RFC 8030 + VAPID) for employees' phones — Android and iOS 16.4+ (installed PWA).
// Called by the manager UI right after a broadcast is created:
//   POST { broadcastId: string }   (manager/admin/owner bearer token)
// Recipients are read from broadcast_recipients server-side; the client never supplies them.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL).
// Generate once with `npx web-push generate-vapid-keys`. Without them this returns 503 and
// the broadcast itself is unaffected (push is best-effort on top of the in-app bell).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildPushPayload, isGonePushStatus } from "./push_payload.js";

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

    const payload = await req.json().catch(() => ({}));
    const broadcastId = typeof payload?.broadcastId === "string" ? payload.broadcastId : "";
    if (!/^[0-9a-f-]{36}$/i.test(broadcastId)) return json({ ok: false, error: "broadcastId is required" }, 400);

    const { data: broadcast } = await admin
      .from("manager_broadcasts").select("id, body, sender_id").eq("id", broadcastId).maybeSingle();
    if (!broadcast) return json({ ok: false, error: "Broadcast not found" }, 404);
    // A manager may only push their own broadcasts (prevents replaying someone else's).
    if (broadcast.sender_id !== callerUser.user.id) return json({ ok: false, error: "Forbidden" }, 403);

    const { data: recipients } = await admin
      .from("broadcast_recipients").select("employee_id").eq("broadcast_id", broadcastId);
    const employeeIds = (recipients ?? []).map((r) => r.employee_id);
    if (employeeIds.length === 0) return json({ ok: true, sent: 0, failed: 0, removed: 0 });

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions").select("id, endpoint, p256dh, auth")
      .in("user_id", employeeIds).limit(MAX_SUBSCRIPTIONS);
    if (subsErr) return json({ ok: false, error: subsErr.message }, 500);

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const message = buildPushPayload({
      title: "SparkLog", body: broadcast.body, url: "/", tag: `broadcast-${broadcastId}`,
    });

    let sent = 0, failed = 0;
    const gone: string[] = [];
    // generateRequestDetails builds the encrypted request; we send it with fetch() so the
    // call is bounded by an AbortSignal and does not depend on Node's https module.
    await Promise.all((subs ?? []).map(async (sub) => {
      try {
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
    return json({ ok: true, sent, failed, removed: gone.length });
  } catch (e) {
    console.error("[send_push] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
