// Pure parser for the text of a work-order screenshot (no browser or network dependency).
export function parseExtractedText(text) {
  const out = {};

  const ot = text.match(/OT[\s\-_:]*(\d{4,8})/i);
  if (ot) out.ot = ot[1];

  const dates = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (dates.length) {
    const [, dd, mm, yyyy] = dates[0];
    out.job_date = `${yyyy}-${mm}-${dd}`;
  }

  const labelTime = (labelRegex) => {
    const m = text.match(labelRegex);
    if (!m) return null;
    const tail = text.slice(m.index, m.index + 200);
    const t = tail.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
    return t ? `${String(t[1]).padStart(2, "0")}:${t[2]}` : null;
  };

  // Labels are matched in both the French and the English variants of the
  // source work-order app (it can be displayed in either language).
  const depart = labelTime(/(?:Heure\s+de\s+d[eé]but|Start\s*Time)/i);
  if (depart) out.depart = depart;

  const fin = labelTime(/(?:Heure\s+de\s+fin|End\s*Time)/i);
  if (fin) out.fin = fin;

  const arrivee = labelTime(/(?:Heure\s+d['’]?\s*arriv[eé]e|(?:Actual\s+)?Arrival\s*Time)/i);
  if (arrivee) out.arrivee = arrivee;

  // Handles "Distance parcourue", "Distance réelle parcourue (km)" and the
  // English "Distance travelled". The optional words between "Distance" and
  // the keyword are skipped, then the first number after it is the value.
  const km = text.match(/Distance[^\n\d]*?(?:parcourue|travell?ed)[^\d]*?(\d+(?:[.,]\d+)?)/i);
  if (km) out.km_aller = Math.round(parseFloat(km[1].replace(",", ".")));

  return out;
}
