// Reads the numbers of the overtime request form (Microsoft Forms) from the text OCR.space returns for its screenshot:
//   3. Numéro du OT-XXXXXX *          -> OT-208637
//   4. Combien de minute chez le client *   -> 60
//   5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *   -> 0
// Only these three numbers are kept (never the raw text: it can hold names and other personal information).
// Every value is null when it cannot be found, so an unreadable picture is never taken for a zero.
// Shared by the Edge function `process_overtime_evidence` and the browser (src/lib/overtime-form.js).

// A number that is not the « 5. » numbering of the next question, nor part of the date answered further down the form
// (« 2026-11-19 » must never be read as 2026 minutes): at most 3 digits, not followed by another digit or by a date separator.
const ANSWER = String.raw`(\d{1,3})(?!\d)(?![-/.]\d)(?!\s*[.)]\s*[A-Za-zÀ-ÿ])`;

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

// Is this text the overtime request form itself? The form has its own questions; a work order, a supper receipt or any other
// screenshot does not (it may still carry an « OT-198909 » in its header, which is why an OT number alone proves nothing).
// At least 2 of these marks must be present.
const FORM_MARKS = [
  /chez\s+le\s+client/i,
  /retour\s+[àa]\s+l.?entrep[oô]t/i,
  /combien\s+de\s+minutes?/i,
  /num[eé]ro\s+du\s+OT/i,
  /confirmation\s+de\s+temps\s+supp/i,
];

export function isOvertimeFormText(text) {
  const source = String(text || "");
  return FORM_MARKS.filter((mark) => mark.test(source)).length >= 2;
}

export function overtimeFormFound(parsed) {
  return Boolean(parsed) && (parsed.ot !== null || parsed.clientMinutes !== null || parsed.returnMinutes !== null);
}

// Reading by LINES (position on the picture) instead of by the order of the text. OCR.space can return every line with its
// position (TextOverlay); the form's layout is fixed: each question is followed, one line below, by the box holding the answer.
// So the answer of a question is the first line under it (before the next question), whatever order the plain text comes in.
// `rawLines` = [{ text, top, left }]. `located` says which questions were found on the picture: a located question with no
// answer under it is a real « nothing there » (null), not a reason to look for the number elsewhere in the text.
const QUESTION = {
  ot: /num[eé]ro\s+du\s+OT/i,
  client: /chez\s+le\s+client/i,
  back: /retour\s+[àa]\s+l.?entrep[oô]t/i,
  date: /^\W*(?:\d+\W+)?date\b/i,
};
const MINUTES_LINE = /^\W*(\d{1,3})(?:\s*min\w*)?\W*$/i;
const OT_LINE = /^\W*(?:OT[\s\-–—_:]*)?(\d{3,8})\W*$/i;

export function parseOvertimeFormLines(rawLines) {
  const lines = (rawLines || [])
    .map((line) => ({ text: String(line?.text || "").trim(), top: Number(line?.top), left: Number(line?.left) || 0 }))
    .filter((line) => line.text && Number.isFinite(line.top))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const result = { ot: null, clientMinutes: null, returnMinutes: null, located: { ot: false, client: false, back: false } };
  const find = (re, from = 0) => {
    for (let i = from; i < lines.length; i += 1) if (re.test(lines[i].text)) return i;
    return -1;
  };
  const iOt = find(QUESTION.ot);
  const iClient = find(QUESTION.client);
  const iBack = find(QUESTION.back);
  const iDate = find(QUESTION.date, Math.max(iBack, iClient, iOt, 0));
  const starts = [iOt, iClient, iBack, iDate].filter((i) => i >= 0).sort((a, b) => a - b);

  // The question may wrap on two lines (« … retour à l'entrepôt si » / « applicable sinon inscrire 0 * »).
  let backEnd = iBack;
  while (iBack >= 0 && backEnd - iBack < 2 && backEnd + 1 < lines.length && !/inscrire/i.test(lines[backEnd].text) && /applicable|sinon|inscrire/i.test(lines[backEnd + 1].text)) backEnd += 1;

  const answer = (start, end, pattern) => {
    const next = starts.find((i) => i > start);
    const stop = next === undefined ? lines.length : next;
    for (let i = end + 1; i < stop; i += 1) {
      const match = lines[i].text.match(pattern);
      if (match) return match[1];
    }
    // The answer may sit on the question's own line, after the « * ».
    const sameLine = lines[end].text.match(/\*\s*(\d{1,8})\s*$/);
    return sameLine ? sameLine[1] : null;
  };

  if (iOt >= 0) {
    result.located.ot = true;
    const value = answer(iOt, iOt, OT_LINE);
    if (value) result.ot = value;
  }
  if (iClient >= 0) {
    result.located.client = true;
    const value = answer(iClient, iClient, MINUTES_LINE);
    if (value !== null && /^\d{1,3}$/.test(value)) result.clientMinutes = Number(value);
  }
  if (iBack >= 0) {
    result.located.back = true;
    const value = answer(iBack, backEnd, MINUTES_LINE);
    if (value !== null && /^\d{1,3}$/.test(value)) result.returnMinutes = Number(value);
  }
  return result;
}

// Both readings together: a question found on the picture takes the answer read under it; the others fall back to the text.
export function readOvertimeForm({ text, lines }) {
  const byText = parseOvertimeForm(text);
  const byLines = parseOvertimeFormLines(lines);
  return {
    ot: byLines.located.ot ? (byLines.ot ?? byText.ot) : byText.ot,
    clientMinutes: byLines.located.client ? byLines.clientMinutes : byText.clientMinutes,
    returnMinutes: byLines.located.back ? byLines.returnMinutes : byText.returnMinutes,
  };
}
