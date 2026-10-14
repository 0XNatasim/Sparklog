// Pure parser for the text of a work-order screenshot (no browser or network dependency).

// Field labels of the source work-order app, in its French and English variants (it can be
// displayed in either language). A field's value is read only between its label and the next
// label, so an empty field ("---") is never filled with a number from a later field.
//
// On a narrow phone, Field Service wraps the long labels on two lines and puts the value
// between them, so the OCR text can read "Distance\t55,00\nparcourue (miles)" or
// "Distance réelle\nparcourue (km)\t55,00". The distances are therefore found from the word
// "Distance": what follows it up to the next label tells which one it is ("(miles)" or not) and
// holds its value.
const LABELS = {
  depart: /Heure\s+de\s+d[eé]but|Start\s*Time/gi,
  fin: /Heure\s+de\s+fin|End\s*Time/gi,
  arrivee: /Heure\s+d['’]?\s*arriv[eé]e|(?:Actual\s+)?Arrival\s*Time/gi,
  distance: /\bDistance\b/gi,
  // English "Miles Traveled" (the French screen says "Distance parcourue (miles)").
  miles: /Miles\s*Travell?ed|Milles\s+parcourus/gi,
  // Boundaries only.
  other: /\bDur[eé]e\b|\bDuration\b|D[eé]placement|\bStatut\b|\bStatus\b/gi,
};
const SEGMENT_MAX = 160;

// Every label occurrence with the text after it, up to the next label.
function labelSegments(text) {
  const found = [];
  for (const [key, regex] of Object.entries(LABELS)) {
    for (const m of text.matchAll(regex)) found.push({ key, start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const labels = found.filter((label, i) => !found.slice(0, i).some((prev) => label.start < prev.end)); // drop overlaps
  return labels.map((label, i) => {
    const next = labels[i + 1]?.start ?? text.length;
    return { key: label.key, segment: text.slice(label.end, Math.min(next, label.end + SEGMENT_MAX)) };
  });
}

const timeIn = (segment) => {
  const t = segment?.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
  return t ? `${String(t[1]).padStart(2, "0")}:${t[2]}` : null;
};

// Field Service shows distances with decimals ("55,00"): prefer such a number, so a "+" or "-"
// button misread as a digit is not taken for the value.
const numberIn = (segment) => {
  const n = segment?.match(/\d+[.,]\d+/) || segment?.match(/\d+/);
  return n ? parseFloat(n[0].replace(",", ".")) : null;
};

const MILES_WORD = /mile|\(\s*m/i;
const REAL_WORD = /r[ée]e?l+e/i;

export function parseExtractedText(text) {
  const out = {};

  const ot = text.match(/OT[\s\-_:]*(\d{4,8})/i);
  if (ot) out.ot = ot[1];

  // 15/10/2026 (English screen) or 2026-10-14 (French screen): the first one on the screen.
  const date = text.match(/(\d{2})\/(\d{2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
  if (date) out.job_date = date[1] ? `${date[3]}-${date[2]}-${date[1]}` : `${date[4]}-${date[5]}-${date[6]}`;

  const segments = labelSegments(text);
  const first = (key) => segments.find((s) => s.key === key)?.segment ?? null;

  for (const field of ["depart", "fin", "arrivee"]) {
    const value = timeIn(first(field));
    if (value) out[field] = value;
  }

  // "Distance …" is the miles field when "(miles)" follows it, otherwise the real distance (km);
  // with two km candidates, the one saying "réelle" wins.
  const distances = segments.filter((s) => s.key === "distance");
  const milesDistance = distances.find((s) => MILES_WORD.test(s.segment));
  const kmCandidates = distances.filter((s) => !MILES_WORD.test(s.segment));
  const kmDistance = kmCandidates.find((s) => REAL_WORD.test(s.segment)) || kmCandidates[0];

  const km = numberIn(kmDistance?.segment);
  if (km !== null) out.km_aller = Math.round(km);

  // "Miles Traveled" / "Distance parcourue (miles)" (the value is in km despite the name): only
  // used to check that it matches "Distance réelle parcourue (km)", never to fill the form.
  const miles = numberIn(first("miles") ?? milesDistance?.segment);
  if (miles !== null) out.miles_traveled = miles;

  return out;
}

// What the employee must fix in Field Service before relying on the screenshot. `parsed` is
// parseExtractedText(text). Codes: ot, depart, arrivee, fin, km (missing or empty on the
// screenshot) and kmMismatch (Miles Traveled ≠ Distance réelle parcourue, compared in whole km
// like the form).
export function workOrderIssues(parsed) {
  const issues = [];
  for (const field of ["ot", "depart", "arrivee", "fin"]) {
    if (!parsed?.[field]) issues.push({ code: field });
  }
  const hasKm = parsed?.km_aller !== null && parsed?.km_aller !== undefined;
  if (!hasKm) issues.push({ code: "km" });
  const hasMiles = parsed?.miles_traveled !== null && parsed?.miles_traveled !== undefined;
  if (hasKm && hasMiles && Math.round(parsed.miles_traveled) !== parsed.km_aller) {
    issues.push({ code: "kmMismatch", miles: parsed.miles_traveled, km: parsed.km_aller });
  }
  return issues;
}
