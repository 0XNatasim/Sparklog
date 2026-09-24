// Parse a LEGACY pay-stub PDF (previous payroll provider) into a full talon record via pdf.js.
// The layout-aware rebuild lives in talon-import-core (pure, unit-testable); this file only
// adds the pdf.js text extraction. Client-side — the stub never leaves the browser.
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { buildTalonFromItems } from "@/lib/talon-import-core";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

async function readItems(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      const s = (it.str || "").trim();
      if (s) items.push({ s, x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return items;
}

export async function parseFullTalon(file) {
  const items = await readItems(file);
  if (!items.length) { const e = new Error("no_text_layer"); e.code = "no_text_layer"; throw e; }
  return buildTalonFromItems(items);
}
