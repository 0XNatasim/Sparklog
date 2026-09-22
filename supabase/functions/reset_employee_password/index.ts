// Manager/owner-only temporary-password reset for an existing employee account.
// The generated password is returned exactly once so it can be handed to the employee.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: callerUser, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerUser?.user) return json({ ok: false, error: "Invalid session token" }, 401);

    const callerId = callerUser.user.id;
    const admin = createClient(supabaseUrl, serviceRole);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", callerId)
      .maybeSingle();
    if (!callerProfile || !["manager", "owner"].includes(callerProfile.role)) {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const userId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    if (userId === callerId) return json({ ok: false, error: "Use your profile settings to change your own password" }, 400);

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return json({ ok: false, error: "User not found" }, 404);
    if (["manager", "owner"].includes(target.role)) {
      return json({ ok: false, error: "Manager-tier passwords cannot be reset from the employee panel" }, 400);
    }

    const password = generateTemporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
    if (updateError) return json({ ok: false, error: updateError.message }, 500);

    await admin.from("audit_log").insert({
      actor_id: callerId,
      actor_name: callerProfile.full_name ?? null,
      action: "employee_password_reset",
      target_user_id: target.id,
      target_name: target.full_name,
      details: { email: target.email },
    });

    return json({ ok: true, email: target.email, password });
  } catch (error) {
    console.error("[reset_employee_password] unexpected:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
