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

// A failure while reading or preparing a picked picture, with the step that failed
// (read · type · decode · encode) and how many read attempts were made, for the diagnostic.
export class EvidenceFileError extends Error {
  constructor(code, { step, cause, attempts } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = "EvidenceFileError";
    this.code = code;
    this.step = step || "read";
    if (attempts) this.attempts = attempts;
  }
}

const UNREADABLE = /NotReadableError|NotFoundError|SecurityError|could not be read|not readable|permission/i;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads the whole picked file into memory, retrying a few times. Android can refuse the read
// (NotReadableError) for a moment right after a screenshot, or for a picture that is only in the
// cloud (Google Photos). The in-memory copy is then used for everything else, including « Réessayer »,
// so the phone's file is read only once.
export async function readPickedFile(file, { attempts = 3, delayMs = 400, sleep = wait } = {}) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new EvidenceFileError("evidence_file_empty", { step: "read" });
  if (file.size > MAX_EVIDENCE_BYTES) throw new EvidenceFileError("evidence_file_too_large", { step: "read" });
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const buffer = await file.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) throw new EvidenceFileError("evidence_file_empty", { step: "read", attempts: attempt });
      return new Blob([buffer], { type: file.type || "" });
    } catch (error) {
      if (error instanceof EvidenceFileError) throw error;
      lastError = error;
      if (!UNREADABLE.test(`${error?.name || ""} ${error?.message || ""}`)) break;
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }
  throw new EvidenceFileError("evidence_file_unreadable", { step: "read", cause: lastError, attempts });
}

export async function validateEvidenceFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new EvidenceFileError("evidence_file_empty", { step: "read" });
  if (file.size > MAX_EVIDENCE_BYTES) throw new EvidenceFileError("evidence_file_too_large", { step: "read" });
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime = detectImageMime(header);
  if (!mime) throw new EvidenceFileError("evidence_file_type_invalid", { step: "type" });
  return mime;
}

// Decode + canvas re-encode strips EXIF/GPS metadata and normalizes every accepted
// format to JPEG before it reaches Storage or the OCR provider.
// The file is first copied into memory (readPickedFile); a copy already made is used as is.
export async function prepareEvidenceImage(file, { maxEdge = 1600, quality = 0.72, read = readPickedFile } = {}) {
  const source = file instanceof File ? await read(file) : file;
  await validateEvidenceFile(source);
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new EvidenceFileError("evidence_image_decode_failed", { step: "decode" }));
      element.src = url;
    });
    if (image.width * image.height > MAX_EVIDENCE_PIXELS) throw new EvidenceFileError("evidence_image_dimensions_too_large", { step: "decode" });
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size <= 0 || blob.size > MAX_EVIDENCE_BYTES) throw new EvidenceFileError("evidence_image_encode_failed", { step: "encode" });
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
  if (has(/evidence_file_unreadable|NotReadableError|NotFoundError/)) key = "unreadable";
  else if (has(/evidence_file_empty/)) key = "empty";
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

// Failures caused by the picked file itself (not the network or the session): worth a diagnostic, and
// « Réessayer avec la même capture » is pointless when the phone refused to read it.
export const FILE_FAILURE_KEYS = Object.freeze(["unreadable", "empty", "tooLarge", "badType", "decode", "dimensions", "encode"]);

export function isFileFailure(error) {
  return error instanceof EvidenceFileError || FILE_FAILURE_KEYS.includes(evidenceUploadFailure(error).key);
}

// What the Journal keeps about a picture the app could not read (never the picture itself).
export function fileDiagnostics(file, error, { now = Date.now(), userAgent = globalThis.navigator?.userAgent || "", installed = false } = {}) {
  const cause = error?.cause;
  const lastModified = Number(file?.lastModified);
  return {
    size: Number.isFinite(file?.size) ? file.size : -1,
    type: String(file?.type || "?"),
    age_s: Number.isFinite(lastModified) && lastModified > 0 ? Math.max(0, Math.round((now - lastModified) / 1000)) : -1,
    step: error?.step || "?",
    error: [cause?.name || error?.name, cause?.message || error?.message].filter(Boolean).join(": ").slice(0, 80),
    reason: evidenceUploadFailure(error).key,
    attempts: Number(error?.attempts) || 1,
    browser: String(userAgent).slice(0, 200),
    app: installed ? "installed" : "browser",
  };
}
