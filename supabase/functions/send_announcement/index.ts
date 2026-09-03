// supabase/functions/send_announcement/index.ts
//
// Manager → employee announcements, delivered by email.
//
// Same swappable-notification-service shape as before, now email:
//   EmailProvider        transport interface (send one email)
//   MockEmailProvider    default — logs, never hits the network (dev/testing)
//   ResendProvider       real send via Resend  (RESEND_API_KEY + RESEND_FROM)
//   BrevoProvider        real send via Brevo    (BREVO_API_KEY + BREVO_FROM_*)
//   NotificationService  orchestrates persistence + fan-out + delivery logging
//
// Whichever provider's env is configured wins; otherwise it runs in mock mode
// (records everything, sends nothing) so the whole UI works before credentials
// exist. Adding another ESP later = one new `implements EmailProvider` class.
//
// Request (POST, manager bearer token):
//   { subject?: string, body: string, allEmployees?: boolean, recipientIds?: string[] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_LEN = 2000;
const MAX_SUBJECT_LEN = 200;
const DEFAULT_SUBJECT = "Message from your manager";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(v: string | null | undefined): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// ── Provider abstraction ─────────────────────────────────────────────────────
interface SendResult {
  status: "sent" | "failed";
  providerSid?: string;
  error?: string;
}

interface EmailProvider {
  readonly name: string;
  send(to: string, subject: string, body: string): Promise<SendResult>;
}

// Default provider: no network, always "succeeds". Lets the whole pipeline
// (DB rows, history, UI) work end-to-end before real credentials exist.
class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  // deno-lint-ignore require-await
  async send(to: string, subject: string): Promise<SendResult> {
    console.log(`[mock-email] → ${to}: ${subject}`);
    return { status: "sent", providerSid: `mock_${crypto.randomUUID()}` };
  }
}

// Resend (https://resend.com) — needs a verified domain in production.
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string) {}

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          text: body,
          html: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { status: "failed", error: data?.message || `Resend HTTP ${res.status}` };
      return { status: "sent", providerSid: data?.id };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// Brevo / Sendinblue (https://brevo.com) — allows single verified sender email,
// no custom domain required. Friendlier for a small team without a domain.
class BrevoProvider implements EmailProvider {
  readonly name = "brevo";
  constructor(private apiKey: string, private fromEmail: string, private fromName: string) {}

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { email: this.fromEmail, name: this.fromName },
          to: [{ email: to }],
          subject,
          textContent: body,
          htmlContent: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { status: "failed", error: data?.message || `Brevo HTTP ${res.status}` };
      return { status: "sent", providerSid: data?.messageId };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function pickProvider(): EmailProvider {
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFrom = Deno.env.get("RESEND_FROM") ?? "";
  if (resendKey && resendFrom) return new ResendProvider(resendKey, resendFrom);

  const brevoKey = Deno.env.get("BREVO_API_KEY") ?? "";
  const brevoFrom = Deno.env.get("BREVO_FROM_EMAIL") ?? "";
  const brevoName = Deno.env.get("BREVO_FROM_NAME") ?? "SparkLog";
  if (brevoKey && brevoFrom) return new BrevoProvider(brevoKey, brevoFrom, brevoName);

  return new MockEmailProvider();
}

// ── Notification service ─────────────────────────────────────────────────────
interface Recipient { id: string; name: string | null; email: string | null; }

class NotificationService {
  constructor(private admin: SupabaseClient, private provider: EmailProvider) {}

  async sendAnnouncement(opts: {
    senderId: string;
    senderName: string | null;
    subject: string;
    body: string;
    recipients: Recipient[];
  }) {
    const { senderId, senderName, subject, body, recipients } = opts;

    // 1. Persist the message (status: sending)
    const { data: msg, error: msgErr } = await this.admin
      .from("messages")
      .insert({
        sender_id:       senderId,
        sender_name:     senderName,
        channel:         "email",
        subject,
        body,
        recipient_count: recipients.length,
        segment_count:   1,
        provider:        this.provider.name,
        status:          "sending",
      })
      .select("id")
      .single();
    if (msgErr || !msg) throw new Error(msgErr?.message ?? "Failed to create message");
    const messageId = msg.id as string;

    // 2. Persist recipient rows. Rows with no valid email are "skipped".
    const recipientRows = recipients.map((r) => {
      const email = isEmail(r.email) ? r.email!.trim() : null;
      return {
        message_id:      messageId,
        employee_id:     r.id,
        name:            r.name,
        email,
        delivery_status: email ? "queued" : "skipped",
        error:           email ? null : "No email address",
      };
    });
    const { data: insertedRows, error: recErr } = await this.admin
      .from("message_recipients")
      .insert(recipientRows)
      .select("id, email, delivery_status");
    if (recErr) throw new Error(recErr.message);

    // 3. Fan out through the provider, updating each recipient's delivery state.
    let delivered = 0;
    let failed = 0;
    await Promise.all(
      (insertedRows ?? []).map(async (row) => {
        if (row.delivery_status === "skipped" || !row.email) { failed++; return; }
        const result = await this.provider.send(row.email, subject, body);
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
    let subject: string = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    if (!subject) subject = DEFAULT_SUBJECT;
    if ([...subject].length > MAX_SUBJECT_LEN) subject = [...subject].slice(0, MAX_SUBJECT_LEN).join("");

    const allEmployees = payload?.allEmployees === true;
    const recipientIds: string[] = Array.isArray(payload?.recipientIds)
      ? payload.recipientIds.filter((x: unknown) => typeof x === "string")
      : [];

    // Resolve recipients server-side from the DB. Recipients = every profile
    // except the sender (a manager never emails themselves) and never inactive
    // (paused) accounts.
    let query = admin.from("profiles").select("id, full_name, email").neq("id", senderId).not("is_paused", "is", true);
    if (!allEmployees) {
      if (recipientIds.length === 0) return json({ ok: false, error: "No recipients selected" }, 400);
      query = query.in("id", recipientIds);
    }
    const { data: profiles, error: profErr } = await query;
    if (profErr) return json({ ok: false, error: profErr.message }, 500);

    const recipients: Recipient[] = (profiles ?? []).map((p) => ({
      id: p.id, name: p.full_name ?? null, email: p.email ?? null,
    }));
    if (recipients.length === 0) return json({ ok: false, error: "No matching employees" }, 400);

    const service = new NotificationService(admin, pickProvider());
    const result = await service.sendAnnouncement({
      senderId,
      senderName: (senderProfile.full_name || "").trim() || callerUser.user.email || null,
      subject,
      body,
      recipients,
    });

    return json({ ok: true, ...result });
  } catch (e) {
    console.error("[send_announcement] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
