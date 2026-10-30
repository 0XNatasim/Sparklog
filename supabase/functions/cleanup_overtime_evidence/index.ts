import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "Unauthorized" }, 401);
  const admin = createClient(supabaseUrl, serviceRole);
  // Manual run: service-role Bearer. Scheduled run (pg_cron, migration 0094): x-cron-secret
  // checked against Vault.
  if (authorization !== `Bearer ${serviceRole}`) {
    const cronSecret = req.headers.get("x-cron-secret") || "";
    const { data: allowed } = cronSecret
      ? await admin.rpc("verify_cron_secret", { p_secret: cronSecret })
      : { data: false };
    if (allowed !== true) return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const failures: Array<{ phase: string; detail: string }> = [];
  // A picture that is gone no longer needs its « already downloaded » mark (0126).
  const forgetDownloads = async (bucket: string, paths: string[]) => {
    if (!paths.length) return;
    const { error } = await admin.from("evidence_downloads").delete().eq("bucket", bucket).in("storage_path", paths);
    if (error) failures.push({ phase: `forget_downloads:${bucket}`, detail: error.message });
  };
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
      await forgetDownloads("overtime-evidence", expired.map((row) => row.storage_path));
      const { error: deleteError } = await admin
        .from("overtime_evidence")
        .delete()
        .in("id", expired.map((row) => row.id));
      if (deleteError) failures.push({ phase: "delete_expired_rows", detail: deleteError.message });
      else expiredDeleted = expired.length;
    }
  }

  // Parking receipt pictures follow the same retention window (0126). The claim (amount, review) stays: only the
  // pictures go, then the row is emptied so nothing points at a deleted object.
  const { data: expiredParking, error: expiredParkingError } = await admin
    .from("parking_receipts")
    .select("id, storage_path, extra_storage_paths")
    .lte("expires_at", new Date().toISOString())
    .not("storage_path", "is", null)
    .limit(200);
  if (expiredParkingError) failures.push({ phase: "load_expired_parking", detail: expiredParkingError.message });
  for (const claim of expiredParking || []) {
    const paths = [claim.storage_path, ...(claim.extra_storage_paths || [])].filter(Boolean) as string[];
    const { error: storageError } = await admin.storage.from("parking-receipts").remove(paths);
    if (storageError) {
      failures.push({ phase: "delete_expired_parking_objects", detail: storageError.message });
      continue;
    }
    const { error: updateError } = await admin
      .from("parking_receipts")
      .update({ storage_path: null, extra_storage_paths: [], pictures_purged_at: new Date().toISOString() })
      .eq("id", claim.id);
    if (updateError) {
      failures.push({ phase: "purge_expired_parking_rows", detail: updateError.message });
    } else {
      await forgetDownloads("parking-receipts", paths);
      expiredDeleted += 1;
    }
  }

  // End-of-shift inventory screenshots follow the same retention window.
  const { data: expiredInventory, error: expiredInventoryError } = await admin
    .from("inventory_screenshots")
    .select("id, storage_path")
    .lte("expires_at", new Date().toISOString())
    .limit(500);
  if (expiredInventoryError) failures.push({ phase: "load_expired_inventory", detail: expiredInventoryError.message });
  if (expiredInventory?.length) {
    const { error: storageError } = await admin.storage
      .from("inventory-screenshots")
      .remove(expiredInventory.map((row) => row.storage_path));
    if (storageError) {
      failures.push({ phase: "delete_expired_inventory_objects", detail: storageError.message });
    } else {
      const { error: deleteError } = await admin
        .from("inventory_screenshots")
        .delete()
        .in("id", expiredInventory.map((row) => row.id));
      if (deleteError) failures.push({ phase: "delete_expired_inventory_rows", detail: deleteError.message });
      else expiredDeleted += expiredInventory.length;
    }
  }

  // Written inventory rows expire with their screenshots (same expires_at).
  const { error: expiredItemsError } = await admin
    .from("inventory_items")
    .delete()
    .lte("expires_at", new Date().toISOString());
  if (expiredItemsError) failures.push({ phase: "delete_expired_inventory_items", detail: expiredItemsError.message });

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
