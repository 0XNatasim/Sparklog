// Reads the numbers of the overtime request form (Microsoft Forms) from the text OCR.space returns for its screenshot:
//   3. Numéro du OT-XXXXXX *          -> OT-208637
//   4. Combien de minute chez le client *   -> 60
//   5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *   -> 0
// Only these three numbers are kept (never the raw text: it can hold names and other personal information).
// Every value is null when it cannot be found, so an unreadable picture is never taken for a zero.
// Shared by the Edge function `process_overtime_evidence` and the browser (src/lib/overtime-form.js).

// A number that is not the « 5. » numbering of the next question.
const ANSWER = String.raw`(\d{1,4})(?!\s*[.)]\s*[A-Za-zÀ-ÿ])`;

export function parseOvertimeForm(text) {
  const source = String(text || "").replace(/\r/g, "\n");
  const result = { ot: null, clientMinutes: null, returnMinutes: null };

  // « OT-208637 »: digits after OT. The question's own « OT-XXXXXX » has no digits, so it never matches.
  const ot = source.match(/\bOT[\s\-–—_:]*(\d{3,8})\b/i);
  if (ot) result.ot = ot[1];

  const client = source.match(new RegExp(String.raw`chez\s+le\s+client[^\d]{0,24}?` + ANSWER, "i"));
  if (client) result.clientMinutes = Number(client[1]);

  // The return question ends with « inscrire 0 »: skip that 0, then read the answer.
  const back = source.match(new RegExp(String.raw`retour\s+[àa]\s+l.?entrep[oô]t[\s\S]{0,80}?inscrire\s*0[^\d]{0,12}?` + ANSWER, "i"));
  if (back) result.returnMinutes = Number(back[1]);

  return result;
}

export function overtimeFormFound(parsed) {
  return Boolean(parsed) && (parsed.ot !== null || parsed.clientMinutes !== null || parsed.returnMinutes !== null);
}
