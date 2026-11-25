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

// The form of November 2026 (« Confirmation de surtemps »): multiple choice questions. A screenshot often shows only part of it
// (no title, one question), so every visible piece counts: its questions, the hint under question 2, the last choice and the
// question 1 label.
const NEW_FORM_MARKS = [
  /confirmation\s+de\s+surtemps/i,
  /dur[e\u00e9]e\s+r[e\u00e9]elle/i,
  /dur[e\u00e9]e\s+du\s+retour/i,
  /\+\s*de\s*120\s*minutes?/i,
  /\d+\s*minutes?\s*=\s*\d\s*h/i,
  /ordre\s+de\s+travail\s*\*/i,
];
// The OLD form (« Temps réel de TS »): typed answers.
const OLD_FORM_MARKS = [
  /temps\s+r[e\u00e9]el\s+de\s+TS/i,
  /chez\s+le\s+client/i,
  /retour\s+[\u00e0a]\s+l.?entrep[o\u00f4]t/i,
  /combien\s+de\s+minutes?/i,
  /num[e\u00e9]ro\s+du\s+OT/i,
  /confirmation\s+de\s+temps\s+supp/i,
];
// The Microsoft Forms address bar: on both forms, so it only backs up a form that already shows one of its own marks.
const FORMS_ADDRESS = /forms\.(?:cloud\.)?(?:microsoft|office)/i;
// The Field Service work order (page « Bilan » of the booking): not the overtime form.
const FIELD_SERVICE_MARKS = [
  /statut\s+de\s+la\s+r[e\u00e9]servation/i,
  /heure\s+de\s+d[e\u00e9]but/i,
  /heure\s+de\s+fin/i,
  /heure\s+d.arriv[e\u00e9]e/i,
  /distance\s+parcourue/i,
  /soutien\s+et\s+suivis/i,
];

const countMarks = (marks, source) => marks.filter((mark) => mark.test(source)).length;

// What the picture is, from its text: "new" (the form of November 2026), "old" (the form « Temps réel de TS »), "field" (a Field Service
// work order) or null (anything else, unreadable). A work order or a receipt is never taken for the form: at least 2 marks are needed
// (1 when the Microsoft Forms address backs it up and the other form shows none).
export function formKindOf(text) {
  const source = String(text || "");
  const news = countMarks(NEW_FORM_MARKS, source);
  const olds = countMarks(OLD_FORM_MARKS, source);
  const address = FORMS_ADDRESS.test(source);
  if (news >= 2 || (news >= 1 && olds === 0 && address)) return "new";
  if (olds >= 2 || (olds >= 1 && news === 0 && address)) return "old";
  if (countMarks(FIELD_SERVICE_MARKS, source) >= 2) return "field";
  return null;
}

// Is this text the overtime request form itself (either version)? A work order, a supper receipt or any other screenshot is not
// (it may still carry an « OT-198909 » in its header, which is why an OT number alone proves nothing).
export function isOvertimeFormText(text) {
  const kind = formKindOf(text);
  return kind === "new" || kind === "old";
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

// ── The form of November 2026: « 2. Durée réelle du temps supplémentaire (Minutes) » and « 3. Durée du retour », each a list of
// round choices (0, 15, 30 … 120, « + de 120 minutes »). The text says nothing about which circle is filled, so the selected circles
// are found on the picture (radio_circles.js) and matched to the choice written on the same line.
export const OVER_120_MINUTES = 121; // « + de 120 minutes »: stored as 121 = « more than 120 »
const CHOICES = new Set([0, 15, 30, 45, 60, 75, 90, 105, 120]);
const RADIO_QUESTION = {
  client: /dur[eé]e\s+r[eé]elle\s+du\s+temps\s+suppl/i,
  back: /dur[eé]e\s+du\s+retour/i,
  end: /commentaire/i,
  hint: /\d+\s*minutes?\s*=\s*\d\s*h/i,
};

function choiceValue(text) {
  const clean = String(text || "").trim();
  if (/^\W*\+\s*de\s*120/i.test(clean)) return OVER_120_MINUTES;
  // OCR may read the empty circle in front of the choice as a letter O, a 0 or a bracket: « O 30 », « () 45 ».
  const match = clean.match(/^\W*(?:[Oo0()○◯]\s+)?(\d{1,3})\W*$/);
  return match && CHOICES.has(Number(match[1])) ? Number(match[1]) : null;
}

// The choices are always the same list, evenly spaced: 0, 15 … 120, « + de 120 ». OCR often loses one of them (the « 0 » of the first
// line read as a letter, or dropped). A missing choice is put back where the list says it is (found choices give the spacing), so the
// selected circle of a capture that shows « 0 » is matched instead of being refused. Only values inside the list are added.
const CHOICE_LIST = [0, 15, 30, 45, 60, 75, 90, 105, 120, OVER_120_MINUTES];
function fillMissingChoices(choices) {
  const known = choices.map((choice) => ({ ...choice, index: CHOICE_LIST.indexOf(choice.value) })).filter((choice) => choice.index >= 0).sort((a, b) => a.index - b.index);
  if (known.length < 3 || known[known.length - 1].index === known[0].index) return;
  const first = known[0];
  const last = known[known.length - 1];
  const pitch = (last.center - first.center) / (last.index - first.index);
  if (!(pitch > 0)) return;
  CHOICE_LIST.forEach((value, index) => {
    if (choices.some((choice) => choice.value === value)) return;
    const center = first.center + (index - first.index) * pitch;
    if (choices.some((choice) => Math.abs(choice.center - center) < pitch * 0.5)) return; // a line already sits there
    choices.push({ value, center });
  });
  choices.sort((a, b) => a.center - b.center);
}

// `rawLines` = [{ text, top, left, height }] (OCR overlay), `circles` = [{ x, y }] (selected radio buttons). `located` says which
// of the two questions are on the picture; a located question with no selected circle in its block is a real « nothing selected » (null).
export function parseRadioAnswers(rawLines, circles) {
  const lines = (rawLines || [])
    .map((line) => ({ text: String(line?.text || "").trim(), top: Number(line?.top), height: Number(line?.height) || 0 }))
    .filter((line) => line.text && Number.isFinite(line.top))
    .sort((a, b) => a.top - b.top);
  const result = { clientMinutes: null, returnMinutes: null, located: { client: false, back: false } };
  const find = (re) => lines.findIndex((line) => re.test(line.text));
  const starts = { client: find(RADIO_QUESTION.client), back: find(RADIO_QUESTION.back) };
  const comment = find(RADIO_QUESTION.end);
  // The heading can be scrolled out of the capture. Question 2 is still told by the hint under it (« 60 minutes = 1h, 75 minutes … »),
  // question 3 by the « Commentaire » question that follows it when no question 2 is on the picture. Their choices then start at
  // the top of the picture (start = -1).
  const hint = find(RADIO_QUESTION.hint);
  if (starts.client < 0 && hint >= 0) starts.client = hint;
  if (starts.client < 0 && starts.back < 0 && comment >= 0) starts.back = -1;
  for (const [name, key, located] of [["client", "clientMinutes", "client"], ["back", "returnMinutes", "back"]]) {
    const start = starts[name];
    if (start === undefined || (start < 0 && !(name === "back" && comment >= 0 && starts.client < 0))) continue;
    result.located[located] = true;
    // The block of the question: from its heading to the next heading (or « Commentaire »), or the end of the picture.
    const stops = [starts.client, starts.back, comment].filter((index) => index > start);
    const stop = stops.length ? Math.min(...stops) : lines.length;
    const choices = [];
    for (let i = start + 1; i < stop; i += 1) {
      const value = choiceValue(lines[i].text);
      if (value !== null) choices.push({ value, center: lines[i].top + lines[i].height / 2 });
    }
    if (choices.length < 3) continue;
    fillMissingChoices(choices);
    const from = start >= 0 ? lines[start].top : -Infinity;
    const to = stop < lines.length ? lines[stop].top : Infinity;
    // A circle half hidden by the phone's bottom bar has two possible centres (y and altY): both are tried.
    const inside = (y) => y != null && y > from && y < to;
    const inBlock = (circles || []).filter((circle) => inside(circle.y) || inside(circle.altY));
    if (inBlock.length !== 1) continue; // none selected, or the picture is ambiguous: never guessed
    const pitch = choices.length > 1 ? (choices[choices.length - 1].center - choices[0].center) / (choices.length - 1) : 0;
    const matches = [inBlock[0].y, inBlock[0].altY].filter(inside).map((y) => {
      const best = choices.reduce((a, b) => (Math.abs(b.center - y) < Math.abs(a.center - y) ? b : a));
      // The circle must really sit on a choice line (a picture whose coordinates do not match is refused, not guessed).
      return pitch > 0 && Math.abs(best.center - y) > pitch * 0.35 ? null : best;
    });
    const values = new Set(matches.filter(Boolean).map((match) => match.value));
    if (matches.some((match) => !match) && values.size === 0) continue;
    if (values.size !== 1) continue;
    result[key] = [...values][0];
  }
  return result;
}

// Both readings together: a question found on the picture takes the answer read under it; the others fall back to the text.
export function readOvertimeForm({ text, lines, circles }) {
  // The new form (multiple choice): its two answers come from the selected circles; the OT is question 1, read from the text.
  const radio = parseRadioAnswers(lines, circles);
  const byText = parseOvertimeForm(text);
  // Question 1 « Ordre de travail » holds « OT-270185 » (typed in the form): read from the text when it is on the capture.
  if (radio.located.client || radio.located.back) return { ot: byText.ot, clientMinutes: radio.clientMinutes, returnMinutes: radio.returnMinutes };
  const byLines = parseOvertimeFormLines(lines);
  return {
    ot: byLines.located.ot ? (byLines.ot ?? byText.ot) : byText.ot,
    clientMinutes: byLines.located.client ? byLines.clientMinutes : byText.clientMinutes,
    returnMinutes: byLines.located.back ? byLines.returnMinutes : byText.returnMinutes,
  };
}
