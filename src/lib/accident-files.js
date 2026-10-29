import { supabase } from "@/supabaseClient";
import { compressImage } from "@/lib/ocr";
import { withTimeout } from "@/lib/utils";

// Files of an accident file (0123): pictures (compressed to JPEG) and documents, in the private
// "accident-files" bucket, listed in accident_files. Keep the limits in step with the 0123 migration.
export const ACCIDENT_BUCKET = "accident-files";
export const MAX_ACCIDENT_FILES = 20;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// A picture is shrunk before it is sent, so it may be larger as picked (a phone photo).
export const MAX_PICTURE_BYTES = 30 * 1024 * 1024;

const DOCUMENT_TYPES = Object.freeze({
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
});

// For the file picker: pictures (the camera on a phone) and the documents above.
export const ACCIDENT_FILE_ACCEPT = ["image/*", ...Object.keys(DOCUMENT_TYPES).map((ext) => `.${ext}`)].join(",");

const extensionOf = (name) => (/\.([a-z0-9]{1,5})$/i.exec(String(name || ""))?.[1] || "").toLowerCase();

// { kind: "image" | "document", mime, ext } for a file the register accepts, else null. A picture is sent as JPEG
// (SVG is refused: it can carry a script); a document is told apart by its extension, the browser's type being
// often empty or wrong for Office files.
export function classifyAccidentFile(file) {
  const ext = extensionOf(file?.name);
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/") && !type.includes("svg") && ext !== "svg") return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (DOCUMENT_TYPES[ext]) return { kind: "document", mime: DOCUMENT_TYPES[ext], ext };
  return null;
}

// Files picked, added to those already chosen. `existing` = files already on the accident file. Refuses what is
// not accepted, too large, or beyond MAX_ACCIDENT_FILES in all; `skipped` counts them.
export function addPickedAccidentFiles(current, picked, existing = 0) {
  const kept = [...(current || [])];
  let skipped = 0;
  for (const file of picked || []) {
    const info = classifyAccidentFile(file);
    const limit = info?.kind === "image" ? MAX_PICTURE_BYTES : MAX_DOCUMENT_BYTES;
    if (!info || !(Number(file.size) > 0) || Number(file.size) > limit || existing + kept.length >= MAX_ACCIDENT_FILES) { skipped += 1; continue; }
    kept.push(file);
  }
  return { files: kept, skipped };
}

export const accidentFilePath = (accidentId, objectId, ext) => `${accidentId}/${objectId}.${ext}`;

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

const FILE_COLUMNS = "id, accident_id, path, name, kind, mime_type, size_bytes, uploaded_at";

export async function fetchAccidentFiles(accidentId) {
  const { data, error } = await withTimeout(
    supabase.from("accident_files").select(FILE_COLUMNS).eq("accident_id", accidentId).order("uploaded_at", { ascending: true }).limit(MAX_ACCIDENT_FILES),
    12000,
  );
  if (error) throw error;
  return data || [];
}

// Sends one file then records it; if the record fails the object just sent is removed, so nothing is left behind.
export async function uploadAccidentFile(accidentId, file) {
  const info = classifyAccidentFile(file);
  if (!info) throw new Error("accident_file_type");
  const path = accidentFilePath(accidentId, crypto.randomUUID(), info.ext);
  const blob = info.kind === "image" ? await compressImage(file) : file;
  if (!blob || !(blob.size > 0)) throw new Error("accident_file_unreadable");
  const { error: uploadError } = await withTimeout(supabase.storage.from(ACCIDENT_BUCKET).upload(path, blob, { contentType: info.mime, upsert: false }), 60000);
  if (uploadError) throw uploadError;
  const name = info.kind === "image"
    ? `${String(file.name || "photo").replace(/\.[a-z0-9]{1,5}$/i, "").slice(0, 120) || "photo"}.jpg`
    : String(file.name || `document.${info.ext}`).slice(0, 200);
  const { data, error } = await withTimeout(
    supabase.from("accident_files").insert({ accident_id: accidentId, path, name, kind: info.kind, mime_type: info.mime, size_bytes: blob.size }).select(FILE_COLUMNS).single(),
    12000,
  ).catch((failure) => ({ data: null, error: failure }));
  if (error) {
    await supabase.storage.from(ACCIDENT_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return data;
}

// The record first (what the register shows), then the object; a leftover object is only unreachable.
export async function removeAccidentFile(file) {
  const { error } = await withTimeout(supabase.from("accident_files").delete().eq("id", file.id), 12000);
  if (error) throw error;
  await supabase.storage.from(ACCIDENT_BUCKET).remove([file.path]).catch(() => undefined);
}

// Signed links (valid 1 h): Map of path -> url.
export async function signedAccidentFileUrls(paths) {
  const list = [...new Set(paths || [])];
  if (!list.length) return new Map();
  const { data, error } = await withTimeout(supabase.storage.from(ACCIDENT_BUCKET).createSignedUrls(list, 3600), 12000);
  if (error) throw error;
  return new Map((data || []).filter((row) => row?.path && row.signedUrl).map((row) => [row.path, row.signedUrl]));
}

// Number of files of an accident row loaded with `accident_files(count)`.
export const accidentFileCount = (row) => Number(row?.accident_files?.[0]?.count) || 0;
