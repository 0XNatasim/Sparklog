// Pure parser for the text of a work-order screenshot (no browser or network dependency).

// Field labels of the source work-order app, in its French and English variants (it can be
// displayed in either language). A field's value is read only between its label and the next
// label, so an empty field ("---") is never filled with a number from a later field.
const LABELS = {
  depart: /(?:Heure\s+de\s+d[eé]but|Start\s*Time)/i,
  fin: /(?:Heure\s+de\s+fin|End\s*Time)/i,
  arrivee: /(?:Heure\s+d['’]?\s*arriv[eé]e|(?:Actual\s+)?Arrival\s*Time)/i,
  // "Distance parcourue", "Distance réelle parcourue (km)", English "Distance travelled".
  km: /Distance[^\n\d]*?(?:parcourue|travell?ed)(?:\s*\(\s*km\s*\))?/i,
  miles: /(?:Miles\s*Travell?ed|Milles\s+parcourus)/i,
};
const OTHER_LABELS = [/\bDur[eé]e\b/i, /\bDuration\b/i, /D[eé]placement/i];
const SEGMENT_MAX = 120;

// Text between a label and the next known label (at most SEGMENT_MAX characters), or null
// when the label is not on the screenshot.
function segmentAfter(text, labelRegex) {
  const m = text.match(labelRegex);
  if (!m) return null;
  const from = m.index + m[0].length;
  let rest = text.slice(from, from + SEGMENT_MAX);
  for (const other of [...Object.values(LABELS), ...OTHER_LABELS]) {
    const next = rest.match(other);
    if (next) rest = rest.slice(0, next.index);
  }
  return rest;
}

const timeIn = (segment) => {
  const t = segment?.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
  return t ? `${String(t[1]).padStart(2, "0")}:${t[2]}` : null;
};

const numberIn = (segment) => {
  const n = segment?.match(/(\d+(?:[.,]\d+)?)/);
  return n ? parseFloat(n[1].replace(",", ".")) : null;
};

export function parseExtractedText(text) {
  const out = {};

  const ot = text.match(/OT[\s\-_:]*(\d{4,8})/i);
  if (ot) out.ot = ot[1];

  const dates = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (dates.length) {
    const [, dd, mm, yyyy] = dates[0];
    out.job_date = `${yyyy}-${mm}-${dd}`;
  }

  for (const field of ["depart", "fin", "arrivee"]) {
    const value = timeIn(segmentAfter(text, LABELS[field]));
    if (value) out[field] = value;
  }

  const km = numberIn(segmentAfter(text, LABELS.km));
  if (km !== null) out.km_aller = Math.round(km);

  // "Miles Traveled" (the field's value is in km despite its name): only used to check that it
  // matches "Distance réelle parcourue (km)", never to fill the form.
  const miles = numberIn(segmentAfter(text, LABELS.miles));
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
