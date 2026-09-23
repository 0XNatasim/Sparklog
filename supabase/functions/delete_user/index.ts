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

// Best-effort per-user storage cleanup. Returns a list of non-fatal warnings instead of
// throwing, so a storage hiccup can never block removing the account itself.
async function removeUserStorage(admin: ReturnType<typeof createClient>, userId: string): Promise<string[]> {
  const buckets = ["ccq-cards", "meal-receipts", "overtime-evidence", "parking-receipts"];
  const warnings: string[] = [];
  for (const bucket of buckets) {
    try {
      // Removed rows disappear from the first page, so we always re-list from offset 0.
      // A guard cap prevents an infinite loop if a remove silently fails to clear a page.
      for (let guard = 0; guard < 100; guard++) {
        const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100, offset: 0 });
        if (error) { warnings.push(`list ${bucket}: ${error.message}`); break; }
        const items = data || [];
        const paths = items.filter((item) => item.id).map((item) => `${userId}/${item.name}`);
        if (paths.length === 0) break;
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) { warnings.push(`remove ${bucket}: ${removeError.message}`); break; }
        if (items.length < 100) break;
      }
    } catch (e) {
      warnings.push(`${bucket}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return warnings;
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
      .from("profiles").select("role, full_name").eq("id", callerId).maybeSingle();
    if (!callerProfile || !["manager", "owner"].includes(callerProfile.role)) {
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
    // Manager-tier accounts (manager/owner) are protected. `admin` is an office
    // employee (non-manager) and is deletable like any employee, subject to the
    // no-jobs payroll guard below.
    if (["manager", "owner"].includes(target.role)) {
      return json({ ok: false, error: "Manager-tier accounts cannot be deleted here. Change the role first if this is intended." }, 400);
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

    // Storage objects do not cascade when an Auth user is deleted. Remove every known
    // per-user folder first so "delete" really removes the employee's account data. This
    // is best-effort: any failure is collected as a warning, never thrown, so it cannot
    // block the account deletion below (orphaned objects can be reconciled separately).
    const storageWarnings = await removeUserStorage(admin, userId);
    if (storageWarnings.length > 0) console.warn("[delete_user] storage cleanup warnings:", storageWarnings);

    // Delete the auth user; profile and the user's own database rows cascade automatically.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ ok: false, error: `Account deletion failed: ${delErr.message}` }, 500);

    // Record the deletion in the audit log (target snapshot survives the delete).
    await admin.from("audit_log").insert({
      actor_id: callerId,
      actor_name: callerProfile.full_name ?? null,
      action: "user_deleted",
      target_user_id: target.id,
      target_name: target.full_name,
      details: { email: target.email },
    });

    return json({
      ok: true,
      deleted: { id: target.id, name: target.full_name, email: target.email },
      storageWarnings,
    });
  } catch (e) {
    console.error("[delete_user] unexpected:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
