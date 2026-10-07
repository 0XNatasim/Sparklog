import { prepareEvidenceImage, evidenceUploadFailure } from "./evidence-file";
import { refreshSessionOnce, withTimeout } from "./utils";
import { INVENTORY_BUCKET, inventoryStoragePath } from "./inventory-screenshots";

export async function fetchInventorySlots(client, userId, jobDate) {
  const { data, error } = await withTimeout(
    client.from("inventory_screenshots").select("slot, storage_path").eq("user_id", userId).eq("job_date", jobDate),
    10000
  );
  if (error) throw error;
  return data || [];
}

async function uploadWithRefresh(client, path, image) {
  const attempt = () => withTimeout(
    client.storage.from(INVENTORY_BUCKET).upload(path, image, { contentType: "image/jpeg", upsert: false }),
    20000
  );
  try {
    const { error } = await attempt();
    if (error) throw error;
  } catch (firstError) {
    if (!["auth", "timeout", "network"].includes(evidenceUploadFailure(firstError).key)) throw firstError;
    await refreshSessionOnce();
    const { error } = await attempt();
    const duplicate = Number(error?.statusCode ?? error?.status) === 409 || /already exists|duplicate/i.test(error?.message || "");
    if (error && !duplicate) throw error;
  }
}

// Validates and re-encodes the picture, uploads it, then records the slot. A retake replaces
// the slot's row; the previous object is removed best-effort (the cleanup worker reconciles
// anything left behind). A row failure removes the just-uploaded object.
export async function saveInventoryScreenshot(client, { userId, jobDate, slot, file, retentionDays = 30, previousPath = null }) {
  const image = await prepareEvidenceImage(file);
  const path = inventoryStoragePath(userId, jobDate, slot, crypto.randomUUID());
  await uploadWithRefresh(client, path, image);
  const expiresAt = new Date(Date.now() + Math.min(365, Math.max(1, retentionDays)) * 86400000).toISOString();
  const { error } = await withTimeout(
    client.from("inventory_screenshots")
      .upsert({ user_id: userId, job_date: jobDate, slot, storage_path: path, expires_at: expiresAt }, { onConflict: "user_id,job_date,slot" }),
    12000
  );
  if (error) {
    await client.storage.from(INVENTORY_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  if (previousPath && previousPath !== path) {
    await client.storage.from(INVENTORY_BUCKET).remove([previousPath]).catch(() => undefined);
  }
  return path;
}
