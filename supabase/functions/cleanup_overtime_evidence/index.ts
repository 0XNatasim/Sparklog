import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!serviceRole || authorization !== `Bearer ${serviceRole}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: expired, error } = await admin
    .from("overtime_evidence")
    .select("id, storage_path")
    .lte("expires_at", new Date().toISOString())
    .limit(500);
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  if (!expired?.length) return new Response(JSON.stringify({ ok: true, deleted: 0 }), { headers: { "Content-Type": "application/json" } });

  const { error: storageError } = await admin.storage.from("overtime-evidence").remove(expired.map((row) => row.storage_path));
  if (storageError) return new Response(JSON.stringify({ ok: false, error: storageError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  const { error: deleteError } = await admin.from("overtime_evidence").delete().in("id", expired.map((row) => row.id));
  if (deleteError) return new Response(JSON.stringify({ ok: false, error: deleteError.message }), { status: 500, headers: { "Content-Type": "application/json" } });

  return new Response(JSON.stringify({ ok: true, deleted: expired.length }), { headers: { "Content-Type": "application/json" } });
});
