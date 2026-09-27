import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !serviceRole || authorization !== `Bearer ${serviceRole}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const failures: Array<{ phase: string; detail: string }> = [];
  let expiredDeleted = 0;
  let orphanedDeleted = 0;

  // Retention cleanup: delete the object first, then its row. If either operation
  // fails the next scheduled run safely retries it.
  const { data: expired, error: expiredError } = await admin
    .from("overtime_evidence")
    .select("id, storage_path")
    .lte("expires_at", new Date().toISOString())
    .limit(500);
  if (expiredError) failures.push({ phase: "load_expired", detail: expiredError.message });
  if (expired?.length) {
    const { error: storageError } = await admin.storage
      .from("overtime-evidence")
      .remove(expired.map((row) => row.storage_path));
    if (storageError) {
      failures.push({ phase: "delete_expired_objects", detail: storageError.message });
    } else {
      const { error: deleteError } = await admin
        .from("overtime_evidence")
        .delete()
        .in("id", expired.map((row) => row.id));
      if (deleteError) failures.push({ phase: "delete_expired_rows", detail: deleteError.message });
      else expiredDeleted = expired.length;
    }
  }

  // Reconcile objects whose DB write never committed. The SQL function applies a
  // minimum one-hour grace period so active uploads are never collected.
  const { data: orphans, error: orphanError } = await admin.rpc("find_orphaned_evidence_objects", {
    p_older_than: "2 hours",
    p_limit: 500,
  });
  if (orphanError) {
    failures.push({ phase: "load_orphans", detail: orphanError.message });
  } else {
    const byBucket = new Map<string, string[]>();
    for (const row of orphans || []) {
      const paths = byBucket.get(row.bucket_id) || [];
      paths.push(row.object_name);
      byBucket.set(row.bucket_id, paths);
    }
    for (const [bucket, paths] of byBucket) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) failures.push({ phase: `delete_orphans:${bucket}`, detail: error.message });
      else orphanedDeleted += paths.length;
    }
  }

  return json({
    ok: failures.length === 0,
    expired_deleted: expiredDeleted,
    orphaned_deleted: orphanedDeleted,
    failures,
  }, failures.length ? 500 : 200);
});
