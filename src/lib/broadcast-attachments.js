// Attachments of a manager broadcast (Communications, migration 0096): several pictures and PDFs,
// stored in the private "broadcast-images" bucket and listed in manager_broadcasts.attachments as
// [{ path, kind: "image" | "pdf", name }]. Messages sent before 0096 only have image_path.
// Keep MAX_BROADCAST_ATTACHMENTS in sync with the 0096 check constraint.
export const BROADCAST_BUCKET = "broadcast-images";
export const MAX_BROADCAST_ATTACHMENTS = 10;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(String(file?.name || ""));
}

export function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/")) && !isPdfFile(file);
}

// Files picked, pasted or dropped, added to those already chosen. Keeps images and PDFs (a PDF up to
// MAX_PDF_BYTES), in order, up to MAX_BROADCAST_ATTACHMENTS in total. `skipped` counts the rest.
export function addPickedFiles(current, files) {
  const kept = [...(current || [])];
  let skipped = 0;
  for (const file of files || []) {
    const ok = isImageFile(file) || (isPdfFile(file) && Number(file.size || 0) <= MAX_PDF_BYTES);
    if (!ok || kept.length >= MAX_BROADCAST_ATTACHMENTS) { skipped += 1; continue; }
    kept.push(file);
  }
  return { files: kept, skipped };
}

export function attachmentStoragePath(kind, objectId) {
  return `${objectId}.${kind === "pdf" ? "pdf" : "jpg"}`;
}

// Every attachment of a broadcast row, oldest messages included (image_path only).
export function broadcastAttachments(row) {
  const list = Array.isArray(row?.attachments) ? row.attachments.filter((a) => a?.path) : [];
  if (list.length) return list.map((a) => ({ path: a.path, kind: a.kind === "pdf" ? "pdf" : "image", name: a.name || "" }));
  return row?.image_path ? [{ path: row.image_path, kind: "image", name: "" }] : [];
}

// Row values for a new broadcast: the attachments, plus image_path = the first picture so an app
// that predates 0096 (an employee's phone not yet updated) still shows it.
export function broadcastAttachmentColumns(attachments) {
  const list = (attachments || []).filter((a) => a?.path);
  return { attachments: list, image_path: list.find((a) => a.kind !== "pdf")?.path || null };
}
