// supabase/functions/create_employee/index.ts
//
// Manager/owner-only creation of an employee account, WITHOUT the signup
// confirmation email (which is rate-limited on the default SMTP). Uses the admin
// API with email_confirm:true so the account is active immediately — the manager
// then hands the employee the temporary password (or SMS it). This is how the boss
// onboards the crew in bulk instead of relying on each employee self-registering.
//
// Request (POST, manager/owner bearer token):
//   { full_name: string, email: string, phone?: string, password?: string }
// Response: { ok, user_id, email, password, generated }  (password is the temp one to share)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// A readable, strong-enough temporary password: 12 chars, no ambiguous glyphs.
function genPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);

    // Authenticate the caller and require a manager-tier role.
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: callerUser, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser?.user) return json({ ok: false, error: "Invalid session token" }, 401);
    const callerId = callerUser.user.id;

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: callerProfile } = await admin.from("profiles").select("role, full_name").eq("id", callerId).maybeSingle();
    if (!callerProfile || !["manager", "owner"].includes(callerProfile.role)) {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    // Validate input.
    const payload = await req.json().catch(() => ({}));
    const full_name = typeof payload?.full_name === "string" ? payload.full_name.trim() : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const phone = typeof payload?.phone === "string" ? payload.phone.trim() : "";
    let password = typeof payload?.password === "string" ? payload.password : "";
    if (!full_name) return json({ ok: false, error: "full_name is required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "A valid email is required" }, 400);

    const generated = !password;
    if (!password) password = genPassword();
    if (password.length < 6) return json({ ok: false, error: "Password must be at least 6 characters" }, 400);

    // Create the account already confirmed — NO confirmation email is sent, so this
    // never hits the email rate limit. The handle_new_user trigger seeds the profile.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });
    if (createErr) {
      const msg = /already been registered|already exists|duplicate/i.test(createErr.message)
        ? "An account with this email already exists."
        : createErr.message;
      return json({ ok: false, error: msg }, 400);
    }
    const userId = created?.user?.id;
    if (!userId) return json({ ok: false, error: "Account creation returned no id" }, 500);

    // Ensure the profile carries the contact fields (whitelisted; role untouched).
    await admin.from("profiles").update({ full_name, phone: phone || null, email }).eq("id", userId);

    await admin.from("audit_log").insert({
      actor_id: callerId,
      actor_name: callerProfile.full_name ?? null,
      action: "user_created",
      target_user_id: userId,
      target_name: full_name,
      details: { email },
    });

    return json({ ok: true, user_id: userId, email, password, generated });
  } catch (e) {
    console.error("[create_employee] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
