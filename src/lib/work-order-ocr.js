// Work-order screenshot reader shared by the employee form and the owner emergency
// timesheet: compress the image in the browser, read it with ocr.space (French engine,
// table mode) and fall back to local tesseract.js, then pull the job fields out of the text.
import { withTimeout } from "./utils";

export { parseExtractedText } from "./work-order-parse";

async function compressImage(file, maxEdge = 1600, quality = 0.7) {
  const url = URL.createObjectURL(file);
  try {
    // A very large image, an odd format, or memory pressure on a phone can make
    // decoding stall forever (onload/onerror never fire). Bound it so the whole
    // evidence flow can't freeze on image prep — fall back to the original file.
    const img = await withTimeout(
      new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("image_decode_failed"));
        i.src = url;
      }),
      15000
    );
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await withTimeout(
      new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality)),
      15000
    );
    // toBlob can hand back null (unsupported/again memory pressure); never upload null.
    return blob || file;
  } catch (error) {
    console.warn("[compressImage] falling back to original file:", error?.message || error);
    return file; // upload the original rather than dead-ending the evidence flow
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ocrSpaceExtract(file) {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY || "helloworld";
  const blob = await compressImage(file);
  const fd = new FormData();
  fd.append("file", blob, "job.jpg");
  fd.append("language", "fre");
  fd.append("OCREngine", "2");
  fd.append("scale", "true");
  fd.append("isTable", "true");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: fd,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`ocr.space HTTP ${res.status}`);
  const json = await res.json();
  if (json?.IsErroredOnProcessing) {
    throw new Error(
      Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : String(json.ErrorMessage || "ocr.space error")
    );
  }
  const text = (json?.ParsedResults || []).map((r) => r?.ParsedText || "").join("\n");
  if (!text.trim()) throw new Error("ocr.space returned no text");
  return text;
}

// OCR text of a work-order screenshot (never stored; only the parsed fields are used).
export async function extractWorkOrderText(file) {
  try {
    return await ocrSpaceExtract(file);
  } catch (apiErr) {
    console.warn("ocr.space failed, falling back to Tesseract:", apiErr);
    const { default: Tesseract } = await import("tesseract.js");
    const { data: ocr } = await Tesseract.recognize(file, "fra+eng");
    return ocr?.text || "";
  }
}
