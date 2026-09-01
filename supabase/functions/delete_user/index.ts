// supabase/functions/delete_user/index.ts
//
// Manager-only hard delete of a user account (auth + profile). Intended for
// cleaning up mistakes like a duplicate registration — NOT for offboarding an
// employee who has real payroll data (use the "inactive" toggle for that).
//
// Safety guards:
//   - caller must be a manager
//   - cannot delete yourself
//   - cannot delete another manager
//   - refuses if the user has any time entries (jobs), to protect payroll
//     history — the manager is told to keep the account inactive instead
//
// Deleting the auth user cascades (profiles.id references auth.users ON DELETE
// CASCADE, and the user's own rows cascade from profiles) so no manual cleanup
// of the user's data is needed.
//
// Request (POST, manager bearer token): { userId: string }

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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
    const callerId = callerUser.user.id;

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: callerProfile } = await admin
      .from("profiles").select("role").eq("id", callerId).maybeSingle();
    if (!callerProfile || callerProfile.role !== "manager") {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    // Validate input.
    const payload = await req.json().catch(() => ({}));
    const userId: string = typeof payload?.userId === "string" ? payload.userId.trim() : "";
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    if (userId === callerId) return json({ ok: false, error: "You cannot delete your own account" }, 400);

    // Load the target and apply safety guards.
    const { data: target } = await admin
      .from("profiles").select("id, role, full_name, email").eq("id", userId).maybeSingle();
    if (!target) return json({ ok: false, error: "User not found" }, 404);
    if (target.role === "manager") {
      return json({ ok: false, error: "Managers cannot be deleted here. Change the role first if this is intended." }, 400);
    }

    // Protect payroll history: never hard-delete a user who has time entries.
    const { count: jobCount, error: jobErr } = await admin
      .from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (jobErr) return json({ ok: false, error: jobErr.message }, 500);
    if ((jobCount ?? 0) > 0) {
      return json({
        ok: false,
        error: `This user has ${jobCount} time entr${jobCount === 1 ? "y" : "ies"}. To protect payroll history, keep the account inactive instead of deleting it.`,
      }, 409);
    }

    // Delete the auth user; profile and the user's own rows cascade automatically.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ ok: false, error: delErr.message }, 500);

    return json({ ok: true, deleted: { id: target.id, name: target.full_name, email: target.email } });
  } catch (e) {
    console.error("[delete_user] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
