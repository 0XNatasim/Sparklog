// supabase/functions/send_sms/index.ts
//
// Manager → employee SMS announcements.
//
// Architected as a small notification service so the transport is swappable:
//   SMSProvider          transport interface (send one message)
//   MockProvider         default — logs, never hits the network (dev/testing)
//   TwilioProvider       real Twilio REST send, used when creds are configured
//   NotificationService  orchestrates persistence + fan-out + delivery logging
//
// Adding Telnyx/MessageBird/etc. later = one new `implements SMSProvider`
// class + a branch in pickProvider(). The UI and DB never change.
//
// Request (POST, manager bearer token):
//   { body: string, allEmployees?: boolean, recipientIds?: string[] }
// Response:
//   { ok, messageId, provider, recipientCount, delivered, failed, status }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_LEN = 500;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// SMS segmentation: GSM-7 is 160 chars for a single segment, 153 per part
// once concatenated. We approximate on the conservative GSM-7 path.
function segmentCount(body: string): number {
  const len = [...body].length;
  if (len === 0) return 0;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

// Normalize a stored phone into E.164-ish digits. Assumes North America when
// no country code is present (10 digits → +1XXXXXXXXXX).
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// ── Provider abstraction ─────────────────────────────────────────────────────
interface SendResult {
  status: "sent" | "failed";
  providerSid?: string;
  error?: string;
}

interface SMSProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SendResult>;
}

// Default provider: no network, always "succeeds". Lets the whole pipeline
// (DB rows, history, UI) work end-to-end before real credentials exist.
class MockProvider implements SMSProvider {
  readonly name = "mock";
  // deno-lint-ignore require-await
  async send(to: string, body: string): Promise<SendResult> {
    console.log(`[mock-sms] → ${to}: ${body.slice(0, 60)}${body.length > 60 ? "…" : ""}`);
    return { status: "sent", providerSid: `mock_${crypto.randomUUID()}` };
  }
}

// Real Twilio transport. Activated only when all three env vars are present.
class TwilioProvider implements SMSProvider {
  readonly name = "twilio";
  constructor(
    private accountSid: string,
    private authToken: string,
    private from: string,
  ) {}

  async send(to: string, body: string): Promise<SendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const form = new URLSearchParams({ To: to, From: this.from, Body: body });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${this.accountSid}:${this.authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { status: "failed", error: data?.message || `Twilio HTTP ${res.status}` };
      }
      return { status: "sent", providerSid: data?.sid };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function pickProvider(): SMSProvider {
  const sid   = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")  ?? "";
  const from  = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
  if (sid && token && from) return new TwilioProvider(sid, token, from);
  return new MockProvider();
}

// ── Notification service ─────────────────────────────────────────────────────
interface Recipient { id: string; name: string | null; phone: string | null; }

class NotificationService {
  constructor(private admin: SupabaseClient, private provider: SMSProvider) {}

  async sendAnnouncement(opts: {
    senderId: string;
    senderName: string | null;
    body: string;
    recipients: Recipient[];
  }) {
    const { senderId, senderName, body, recipients } = opts;
    const segments = segmentCount(body);

    // 1. Persist the message (status: sending)
    const { data: msg, error: msgErr } = await this.admin
      .from("messages")
      .insert({
        sender_id:       senderId,
        sender_name:     senderName,
        channel:         "sms",
        body,
        recipient_count: recipients.length,
        segment_count:   segments,
        provider:        this.provider.name,
        status:          "sending",
      })
      .select("id")
      .single();
    if (msgErr || !msg) throw new Error(msgErr?.message ?? "Failed to create message");
    const messageId = msg.id as string;

    // 2. Persist recipient rows (status: queued). Rows with no valid phone are
    //    recorded as "skipped" so history reflects reality.
    const recipientRows = recipients.map((r) => {
      const phone = normalizePhone(r.phone);
      return {
        message_id:      messageId,
        employee_id:     r.id,
        name:            r.name,
        phone,
        delivery_status: phone ? "queued" : "skipped",
        error:           phone ? null : "No phone number",
      };
    });
    const { data: insertedRows, error: recErr } = await this.admin
      .from("message_recipients")
      .insert(recipientRows)
      .select("id, phone, delivery_status");
    if (recErr) throw new Error(recErr.message);

    // 3. Fan out through the provider, updating each recipient's delivery state.
    let delivered = 0;
    let failed = 0;
    await Promise.all(
      (insertedRows ?? []).map(async (row) => {
        if (row.delivery_status === "skipped" || !row.phone) { failed++; return; }
        const result = await this.provider.send(row.phone, body);
        if (result.status === "sent") delivered++; else failed++;
        await this.admin
          .from("message_recipients")
          .update({
            delivery_status: result.status,
            provider_sid:    result.providerSid ?? null,
            error:           result.error ?? null,
            delivered_at:    result.status === "sent" ? new Date().toISOString() : null,
          })
          .eq("id", row.id);
      }),
    );

    // 4. Roll up the message status.
    const status = failed === 0 ? "sent" : delivered === 0 ? "failed" : "partial";
    await this.admin
      .from("messages")
      .update({ status, sent_at: new Date().toISOString() })
      .eq("id", messageId);

    return { messageId, provider: this.provider.name, recipientCount: recipients.length, delivered, failed, status };
  }
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")              ?? "";
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRole) {
      return json({ ok: false, error: "Server env not configured" }, 500);
    }

    // Authenticate the caller and require the manager role.
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: callerUser, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser?.user) return json({ ok: false, error: "Invalid session token" }, 401);
    const senderId = callerUser.user.id;

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: senderProfile } = await admin
      .from("profiles").select("role, full_name").eq("id", senderId).maybeSingle();
    if (!senderProfile || senderProfile.role !== "manager") {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    // Validate input.
    const payload = await req.json().catch(() => ({}));
    const body: string = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (!body) return json({ ok: false, error: "Message body is required" }, 400);
    if ([...body].length > MAX_BODY_LEN) {
      return json({ ok: false, error: `Message exceeds ${MAX_BODY_LEN} characters` }, 400);
    }
    const allEmployees = payload?.allEmployees === true;
    const recipientIds: string[] = Array.isArray(payload?.recipientIds)
      ? payload.recipientIds.filter((x: unknown) => typeof x === "string")
      : [];

    // Resolve recipients server-side from the DB (never trust client phone
    // numbers). Employees = every profile that is not a manager.
    let query = admin.from("profiles").select("id, full_name, phone").neq("role", "manager");
    if (!allEmployees) {
      if (recipientIds.length === 0) return json({ ok: false, error: "No recipients selected" }, 400);
      query = query.in("id", recipientIds);
    }
    const { data: profiles, error: profErr } = await query;
    if (profErr) return json({ ok: false, error: profErr.message }, 500);

    const recipients: Recipient[] = (profiles ?? []).map((p) => ({
      id: p.id, name: p.full_name ?? null, phone: p.phone ?? null,
    }));
    if (recipients.length === 0) return json({ ok: false, error: "No matching employees" }, 400);

    const service = new NotificationService(admin, pickProvider());
    const result = await service.sendAnnouncement({
      senderId,
      senderName: (senderProfile.full_name || "").trim() || callerUser.user.email || null,
      body,
      recipients,
    });

    return json({ ok: true, ...result });
  } catch (e) {
    console.error("[send_sms] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
