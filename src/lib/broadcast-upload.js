// Upload of Communications attachments (pictures compressed to JPEG, PDFs as they are), shared by
// a new message and the edit of a sent one. On a failure the files already sent are removed so
// nothing is left behind.
import { supabase } from "../supabaseClient";
import { compressImage } from "./ocr";
import { BROADCAST_BUCKET, attachmentStoragePath, isPdfFile } from "./broadcast-attachments";

export async function uploadBroadcastFiles(files) {
  const attachments = [];
  try {
    for (const file of files || []) {
      const pdf = isPdfFile(file);
      const path = attachmentStoragePath(pdf ? "pdf" : "image", crypto.randomUUID());
      const blob = pdf ? file : await compressImage(file);
      const { error } = await supabase.storage.from(BROADCAST_BUCKET).upload(path, blob, { contentType: pdf ? "application/pdf" : "image/jpeg", upsert: false });
      if (error) throw error;
      attachments.push({ path, kind: pdf ? "pdf" : "image", name: pdf ? String(file.name || "").slice(0, 120) : "" });
    }
    return attachments;
  } catch (e) {
    await removeBroadcastFiles(attachments);
    throw e;
  }
}

export async function removeBroadcastFiles(attachments) {
  if (!attachments?.length) return;
  await supabase.storage.from(BROADCAST_BUCKET).remove(attachments.map((a) => a.path)).catch(() => undefined);
}
