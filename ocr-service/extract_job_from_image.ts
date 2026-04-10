import Tesseract from "tesseract.js";
import sharp from "sharp";

export type ExtractedJob = {
  job_date: string | null;
  ot: string | null;
  depart: string | null;
  arrivee: string | null;
  fin: string | null;
  km_aller: number | null;
};

type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeFrenchNumber(input: string): number | null {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(dateDdMmYyyy: string | null): string | null {
  if (!dateDdMmYyyy) return null;
  const match = dateDdMmYyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function extractAllTimes(text: string): string[] {
  return [...text.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(
    (m) => `${m[1]}:${m[2]}`
  );
}

function parseOt(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/\bOT[-\s]?(\d{4,})\b/i);
  return match?.[1] ?? null;
}

function parseDepartAndFin(text: string): {
  job_date: string | null;
  depart: string | null;
  fin: string | null;
} {
  const normalized = normalizeWhitespace(text);

  const dates = [...normalized.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(
    (m) => m[1]
  );
  const times = extractAllTimes(normalized);

  return {
    job_date: toIsoDate(dates[0] ?? null),
    depart: times[0] ?? null,
    fin: times[1] ?? null,
  };
}

function parseArrivee(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const times = extractAllTimes(normalized);
  return times[0] ?? null;
}

function parseDistance(text: string): number | null {
  const normalized = normalizeWhitespace(text);

  const labelMatch = normalized.match(
    /distance\s+parcourue[\s\S]*?(\d{1,4}(?:[.,]\d{1,2})?)/i
  );
  if (labelMatch?.[1]) {
    return normalizeFrenchNumber(labelMatch[1]);
  }

  const fallbackMatch = normalized.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\b/);
  if (!fallbackMatch?.[1]) return null;

  return normalizeFrenchNumber(fallbackMatch[1]);
}

async function preprocessWholeImage(imageBuffer: Buffer): Promise<Buffer> {
  return await sharp(imageBuffer)
    .rotate()
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

async function getImageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

function buildZones(width: number, height: number): {
  ot: CropBox;
  depart_block: CropBox;
  arrivee_block: CropBox;
  distance_block: CropBox;
} {
  return {
    ot: {
      left: Math.round(width * 0.08),
      top: Math.round(height * 0.00),
      width: Math.round(width * 0.60),
      height: Math.round(height * 0.11),
    },
    depart_block: {
      left: Math.round(width * 0.06),
      top: Math.round(height * 0.20),
      width: Math.round(width * 0.88),
      height: Math.round(height * 0.34),
    },
    arrivee_block: {
      left: Math.round(width * 0.06),
      top: Math.round(height * 0.47),
      width: Math.round(width * 0.88),
      height: Math.round(height * 0.16),
    },
    distance_block: {
      left: Math.round(width * 0.06),
      top: Math.round(height * 0.61),
      width: Math.round(width * 0.88),
      height: Math.round(height * 0.22),
    },
  };
}

async function cropZone(
  imageBuffer: Buffer,
  box: CropBox,
  enlarge = 2
): Promise<Buffer> {
  return await sharp(imageBuffer)
    .extract({
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    })
    .grayscale()
    .normalize()
    .resize({
      width: Math.max(1, box.width * enlarge),
      height: Math.max(1, box.height * enlarge),
      fit: "fill",
    })
    .sharpen()
    .threshold(160)
    .png()
    .toBuffer();
}

async function ocrBuffer(buffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(buffer, "fra+eng", {
    logger: () => {},
  });

  return normalizeWhitespace(result.data.text || "");
}

export async function extractJobFromImageBuffer(
  imageBuffer: Buffer
): Promise<ExtractedJob> {
  const preprocessed = await preprocessWholeImage(imageBuffer);
  const { width, height } = await getImageSize(preprocessed);
  const zones = buildZones(width, height);

  const [otBuffer, departBuffer, arriveeBuffer, distanceBuffer] =
    await Promise.all([
      cropZone(preprocessed, zones.ot, 3),
      cropZone(preprocessed, zones.depart_block, 2),
      cropZone(preprocessed, zones.arrivee_block, 2),
      cropZone(preprocessed, zones.distance_block, 2),
    ]);

  const [otText, departText, arriveeText, distanceText] = await Promise.all([
    ocrBuffer(otBuffer),
    ocrBuffer(departBuffer),
    ocrBuffer(arriveeBuffer),
    ocrBuffer(distanceBuffer),
  ]);

  const departParsed = parseDepartAndFin(departText);

  return {
    job_date: departParsed.job_date,
    ot: parseOt(otText),
    depart: departParsed.depart,
    arrivee: parseArrivee(arriveeText),
    fin: departParsed.fin,
    km_aller: parseDistance(distanceText),
  };
}
