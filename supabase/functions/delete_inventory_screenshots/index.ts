// Manager-only deletion of an employee's end-of-shift inventory screenshots for one day
// (all three, or a single slot): the stored files, the written list read from them, and the
// screenshot rows. The deletion is recorded in the audit log.
//
// Request (POST, manager bearer token): { user_id: string, job_date: "YYYY-MM-DD", slot?: 1|2|3 }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: role } = await caller.rpc("get_my_role");
  if (role !== "manager") return json({ ok: false, error: "Forbidden: manager role required" }, 403);

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const jobDate = String(body?.job_date || "");
  const slot = body?.slot === undefined || body?.slot === null ? null : Number(body.slot);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(jobDate) || (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 3))) {
    return json({ ok: false, error: "user_id, job_date and an optional slot (1-3) are required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole);
  let query = admin.from("inventory_screenshots").select("slot, storage_path").eq("user_id", userId).eq("job_date", jobDate);
  if (slot !== null) query = query.eq("slot", slot);
  const { data: rows, error: loadError } = await query;
  if (loadError) return json({ ok: false, error: loadError.message }, 500);
  if (!rows?.length) return json({ ok: false, error: "Nothing to delete" }, 404);

  // Files first: if a later step fails, a retry finds the rows again and finishes the job.
  const { error: storageError } = await admin.storage.from("inventory-screenshots").remove(rows.map((row) => row.storage_path));
  if (storageError) return json({ ok: false, error: storageError.message }, 500);

  const slots = rows.map((row) => row.slot);
  const { error: itemsError } = await admin.from("inventory_items").delete()
    .eq("user_id", userId).eq("job_date", jobDate).in("slot", slots);
  if (itemsError) return json({ ok: false, error: itemsError.message }, 500);
  const { error: rowsError } = await admin.from("inventory_screenshots").delete()
    .eq("user_id", userId).eq("job_date", jobDate).in("slot", slots);
  if (rowsError) return json({ ok: false, error: rowsError.message }, 500);

  const [{ data: actor }, { data: target }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", userData.user.id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  await admin.from("audit_log").insert({
    actor_id: userData.user.id,
    actor_name: actor?.full_name ?? null,
    action: "inventory_deleted",
    target_user_id: userId,
    target_name: target?.full_name ?? null,
    details: { job_date: jobDate, slots, count: rows.length },
  });

  return json({ ok: true, deleted: rows.length });
});
