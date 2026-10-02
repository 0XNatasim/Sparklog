export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_PIXELS = 40_000_000;

export function detectImageMime(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function validateEvidenceFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("evidence_file_empty");
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("evidence_file_too_large");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime = detectImageMime(header);
  if (!mime) throw new Error("evidence_file_type_invalid");
  return mime;
}

// Decode + canvas re-encode strips EXIF/GPS metadata and normalizes every accepted
// format to JPEG before it reaches Storage or the OCR provider.
export async function prepareEvidenceImage(file, { maxEdge = 1600, quality = 0.72 } = {}) {
  await validateEvidenceFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("evidence_image_decode_failed"));
      element.src = url;
    });
    if (image.width * image.height > MAX_EVIDENCE_PIXELS) throw new Error("evidence_image_dimensions_too_large");
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size <= 0 || blob.size > MAX_EVIDENCE_BYTES) throw new Error("evidence_image_encode_failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}


// Why an overtime-screenshot upload failed, as an i18n key (`form.evidence.reason.*`) plus
// the raw technical detail, so the employee can read it out and support can act on it.
export function evidenceUploadFailure(error) {
  const raw = String(error?.message || error || "").trim();
  const status = Number(error?.statusCode ?? error?.status ?? 0) || null;
  const detail = [error?.name && error.name !== "Error" ? error.name : "", status, raw].filter(Boolean).join(" · ").slice(0, 200);
  const has = (re) => re.test(`${error?.name || ""} ${raw}`);
  let key = "unknown";
  if (has(/evidence_file_empty/)) key = "empty";
  else if (has(/evidence_file_too_large/)) key = "tooLarge";
  else if (has(/evidence_file_type_invalid/)) key = "badType";
  else if (has(/evidence_image_decode_failed/)) key = "decode";
  else if (has(/evidence_image_dimensions_too_large/)) key = "dimensions";
  else if (has(/evidence_image_encode_failed/)) key = "encode";
  else if (has(/TimeoutError|timed out/i)) key = "timeout";
  else if (status === 401 || status === 403 || has(/jwt|token|expired|not authorized|unauthorized|row-level security|violates/i)) key = "auth";
  else if (status === 413 || has(/exceeded the maximum allowed size|payload too large/i)) key = "tooLarge";
  else if (status === 415 || has(/mime type|not supported/i)) key = "badType";
  else if (has(/failed to fetch|networkerror|network request failed|load failed/i)) key = "network";
  return { key, detail };
}
