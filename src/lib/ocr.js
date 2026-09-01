// Shared OCR helpers: compress an image in-browser and extract text via
// ocr.space (French engine), falling back to local tesseract.js.

export async function compressImage(file, maxEdge = 1600, quality = 0.7) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ocrSpaceExtract(file) {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY || "helloworld";
  const blob = await compressImage(file);
  const fd = new FormData();
  fd.append("file", blob, "card.jpg");
  fd.append("language", "fre");
  fd.append("OCREngine", "2");
  fd.append("scale", "true");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
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
    throw new Error(Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : String(json.ErrorMessage || "ocr.space error"));
  }
  const text = (json?.ParsedResults || []).map((r) => r?.ParsedText || "").join("\n");
  if (!text.trim()) throw new Error("ocr.space returned no text");
  return text;
}

export async function extractTextFromImage(file) {
  try {
    return await ocrSpaceExtract(file);
  } catch (apiErr) {
    console.warn("ocr.space failed, falling back to Tesseract:", apiErr);
    const { default: Tesseract } = await import("tesseract.js");
    const { data } = await Tesseract.recognize(file, "fra+eng");
    return data?.text || "";
  }
}
