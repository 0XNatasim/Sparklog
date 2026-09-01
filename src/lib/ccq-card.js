// Parse OCR text from a Québec CCQ "Certificat de compétence" card into the
// fields SparkLog tracks. Best-effort: the employee/manager confirms the
// values, so favor precision over guessing.
//
// A real card carries, among masked (****) fields:
//   No CLIENT   1434-1226        -> CCQ number
//   ÉCHÉANCE    2027-06-01       -> card expiration
//   DATE DE NAISSANCE 1984-06-20 -> birth date
//   DÉLIVRANCE  2026-05-20       -> issue date (ignored)

const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

function dateNearLabel(text, upper, label) {
  const idx = upper.indexOf(label);
  if (idx === -1) return null;
  const match = text.slice(idx, idx + 80).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function parseCcqCard(rawText) {
  const text = String(rawText || "").replace(/\r/g, "");
  const upper = text.toUpperCase();

  // CCQ client number: four digits, hyphen, four digits (e.g. 1434-1226).
  const clientMatch = text.match(/\b(\d{4}-\d{4})\b/);
  const ccqNumber = clientMatch ? clientMatch[1] : null;

  let expiration = dateNearLabel(text, upper, "ÉCHÉANCE")
    || dateNearLabel(text, upper, "ECHEANCE")
    || dateNearLabel(text, upper, "ECHEAN");
  let birth = dateNearLabel(text, upper, "NAISSANCE");

  // Fallback by chronology: on the card the oldest date is the birth date and
  // the newest is the expiration (issue date sits between).
  const allDates = [...new Set((text.match(DATE_RE) || []))].sort();
  if (!birth && allDates.length) birth = allDates[0];
  if (!expiration && allDates.length) expiration = allDates[allDates.length - 1];

  return { ccqNumber, expiration, birth };
}
