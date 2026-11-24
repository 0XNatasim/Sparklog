import { describe, expect, it } from "vitest";
import { OVER_120_MINUTES, isOvertimeFormText, overtimeFormFound, parseOvertimeForm, parseOvertimeFormLines, parseRadioAnswers, readOvertimeForm } from "./overtime-form";

const FORM = (ot, client, back) => `
automatiquement vos détails, tels que le nom et l'adresse de courriel, sauf si vous le fournissez vous-même.
* Obligatoire
1. Prénom Nom
Pascal
2. Entreprise *
Messier Connexion
3. Numéro du OT-XXXXXX *
${ot}
4. Combien de minute chez le client *
${client}
5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *
${back}`;

describe("reading the overtime request form from the OCR text", () => {
  it("reads the OT, the minutes at the client and the return minutes", () => {
    expect(parseOvertimeForm(FORM("OT-208637", "40", "60"))).toEqual({ ot: "208637", clientMinutes: 40, returnMinutes: 60 });
  });

  it("keeps a real 0 for the return and the OT as written", () => {
    expect(parseOvertimeForm(FORM("OT-000001", "60", "0"))).toEqual({ ot: "000001", clientMinutes: 60, returnMinutes: 0 });
  });

  it("never takes the question's own « OT-XXXXXX » or its « inscrire 0 » for an answer", () => {
    const empty = parseOvertimeForm("3. Numéro du OT-XXXXXX *\n4. Combien de minute chez le client *\n5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *\n");
    expect(empty).toEqual({ ot: null, clientMinutes: null, returnMinutes: null });
    expect(overtimeFormFound(empty)).toBe(false);
  });

  it("does not read the next question's number as an empty answer", () => {
    const parsed = parseOvertimeForm("4. Combien de minute chez le client *\n5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *\n20");
    expect(parsed.clientMinutes).toBeNull();
    expect(parsed.returnMinutes).toBe(20);
  });

  it("never reads the date answered further down the form as the return minutes", () => {
    const parsed = parseOvertimeForm("4. Combien de minute chez le client *\n90\n5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *\ndate *\n2026-11-19");
    expect(parsed.clientMinutes).toBe(90);
    expect(parsed.returnMinutes).toBeNull();
    expect(parseOvertimeForm("Combien de minute chez le client\n2026-11-19").clientMinutes).toBeNull();
  });

  it("copes with accents lost by the OCR and a space instead of the dash", () => {
    const parsed = parseOvertimeForm("Numero du OT 209210 *\nCombien de minute chez le client\n45\nCombien de minute retour a l'entrepot si applicable sinon inscrire 0\n15");
    expect(parsed).toEqual({ ot: "209210", clientMinutes: 45, returnMinutes: 15 });
  });

  it("finds nothing in an SMS screenshot or an empty text", () => {
    expect(overtimeFormFound(parseOvertimeForm("Temps supplémentaire approuvé 30 min"))).toBe(false);
    expect(overtimeFormFound(parseOvertimeForm(""))).toBe(false);
    expect(overtimeFormFound(parseOvertimeForm(null))).toBe(false);
  });
});

// 2026-11-18: a work order sent as the overtime proof was called conforming because its header carries an OT number.
const WORK_ORDER = `OT-198909
Soutien et suivis Bilan
Statut de la réservation *
Terminé
Heure de début *
2026-11-18
11:22
Heure de fin *
2026-11-18
15:00
Durée * 3,63 heures
Heure d'arrivée (info)
2026-11-18 12:33
Déplacement`;

describe("is the picture the overtime form?", () => {
  it("recognises the form by its own questions", () => {
    expect(isOvertimeFormText(FORM("OT-208637", "40", "60"))).toBe(true);
    expect(isOvertimeFormText("Numero du OT 209210\nCombien de minute chez le client\n45")).toBe(true); // accents lost by the OCR
  });

  it("does not take a work order for the form, even though it carries an OT number", () => {
    expect(parseOvertimeForm(WORK_ORDER).ot).toBe("198909"); // what the old reader saw: an OT number, hence « conforming »
    expect(isOvertimeFormText(WORK_ORDER)).toBe(false);
  });

  it("needs at least two of the form's marks (one is not enough)", () => {
    expect(isOvertimeFormText("Combien de minute")).toBe(false);
    expect(isOvertimeFormText("")).toBe(false);
    expect(isOvertimeFormText(null)).toBe(false);
  });
});

describe("reading the answers by lines (position on the picture)", () => {
  // The phone screenshot of the form: 15 min of return, then the date answer 2026-11-19 further down.
  const LINES = [
    ["1. Prénom Nom", 10], ["Roobens Louis", 40], ["2. Entreprise *", 90], ["Messier Connexion", 120],
    ["3. Numéro du OT-XXXXXX *", 170], ["OT-202765", 200], ["4. Combien de minute chez le client *", 250], ["90", 280],
    ["5. Combien de minute retour à l'entrepôt si", 330], ["applicable sinon inscrire 0 *", 355], ["15", 400],
    ["6. date *", 450], ["2026-11-19", 480],
  ].map(([text, top]) => ({ text, top, left: 20 }));

  it("takes each answer from the line under its question", () => {
    expect(parseOvertimeFormLines(LINES)).toMatchObject({ ot: "202765", clientMinutes: 90, returnMinutes: 15 });
  });

  it("does not depend on the order the lines are listed in", () => {
    expect(parseOvertimeFormLines([...LINES].reverse())).toMatchObject({ ot: "202765", clientMinutes: 90, returnMinutes: 15 });
  });

  it("keeps a real 0 and reads nothing (not the date) when the return box is empty", () => {
    const zero = LINES.map((line) => (line.text === "15" ? { ...line, text: "0" } : line));
    expect(parseOvertimeFormLines(zero).returnMinutes).toBe(0);
    const empty = LINES.filter((line) => line.text !== "15");
    const parsed = parseOvertimeFormLines(empty);
    expect(parsed.returnMinutes).toBeNull();
    expect(parsed.located.back).toBe(true);
  });

  it("trusts the line reading over the text when the question is located, and falls back to the text otherwise", () => {
    // The plain text gives the wrong order (the date first): the lines still win.
    const text = "4. Combien de minute chez le client *\n5. Combien de minute retour à l'entrepôt si applicable sinon inscrire 0 *\n2026-11-19\n90\n15";
    expect(readOvertimeForm({ text, lines: LINES })).toEqual({ ot: "202765", clientMinutes: 90, returnMinutes: 15 });
    expect(readOvertimeForm({ text: FORM("OT-208637", "40", "60"), lines: [] })).toEqual({ ot: "208637", clientMinutes: 40, returnMinutes: 60 });
  });
});

// ── The form of November 2026 (« Confirmation de surtemps »): multiple choice, selected circle found on the picture ─────────────
describe("new form: selected circle → minutes", () => {
  const CHOICES = ["0", "15", "30", "45", "60", "75", "90", "105", "120", "+ de 120 minutes"];
  // Lines as OCR.space returns them for the screenshot of question 2 (pixel positions of a 1080 × 2340 picture).
  const question2 = [
    { text: "Confirmation de surtemps - D...", top: 120, height: 40 },
    { text: "2. Durée réelle du temps supplémentaire", top: 700, height: 52 },
    { text: "(Minutes) *", top: 770, height: 52 },
    { text: "60 minutes = 1h, 75 minutes =1h15, 90 minutes =", top: 900, height: 40 },
    ...CHOICES.map((text, i) => ({ text, top: 1000 + i * 148, height: 44 })),
  ];
  const question3 = [
    { text: "3. Durée du retour *", top: 160, height: 52 },
    ...CHOICES.map((text, i) => ({ text, top: 280 + i * 148, height: 44 })),
    { text: "4. Commentaire *", top: 1900, height: 52 },
  ];

  it("reads the choice written on the line of the selected circle (question 2: 30, question 3: 60)", () => {
    // « 30 » is the 3rd choice: centre 1000 + 2 × 148 + 22; « 60 » is the 5th choice: 280 + 4 × 148 + 22.
    expect(parseRadioAnswers(question2, [{ x: 80, y: 1000 + 2 * 148 + 22 }])).toMatchObject({ clientMinutes: 30, returnMinutes: null, located: { client: true, back: false } });
    expect(parseRadioAnswers(question3, [{ x: 80, y: 280 + 4 * 148 + 22 }])).toMatchObject({ clientMinutes: null, returnMinutes: 60, located: { client: false, back: true } });
  });

  it("reads « 0 » and « + de 120 minutes » (stored as 121)", () => {
    expect(parseRadioAnswers(question3, [{ x: 80, y: 280 + 22 }]).returnMinutes).toBe(0);
    expect(parseRadioAnswers(question3, [{ x: 80, y: 280 + 9 * 148 + 22 }]).returnMinutes).toBe(OVER_120_MINUTES);
  });

  it("reads both questions of one long screenshot, each circle going to its own question", () => {
    const longShot = [...question2, ...question3.map((line) => ({ ...line, top: line.top + 2500 }))];
    const circles = [{ x: 80, y: 1000 + 3 * 148 + 22 }, { x: 80, y: 2500 + 280 + 1 * 148 + 22 }];
    expect(parseRadioAnswers(longShot, circles)).toMatchObject({ clientMinutes: 45, returnMinutes: 15 });
  });

  it("never guesses: no circle, two circles in one question, a circle off every line, or a missing heading give null", () => {
    expect(parseRadioAnswers(question2, []).clientMinutes).toBeNull();
    expect(parseRadioAnswers(question2, [{ x: 80, y: 1000 + 22 }, { x: 80, y: 1300 }]).clientMinutes).toBeNull();
    expect(parseRadioAnswers(question2, [{ x: 80, y: 1000 + 0.5 * 148 + 22 }]).clientMinutes).toBeNull();
    expect(parseRadioAnswers(question2.filter((line) => !/Durée réelle/.test(line.text)), [{ x: 80, y: 1370 }]).located.client).toBe(false);
  });

  it("tolerates the empty circle read as a letter in front of a choice", () => {
    const noisy = question3.map((line) => (/^\d+$/.test(line.text) ? { ...line, text: `O ${line.text}` } : line));
    expect(parseRadioAnswers(noisy, [{ x: 80, y: 280 + 4 * 148 + 22 }]).returnMinutes).toBe(60);
  });

  it("readOvertimeForm uses the circles for the new form, leaves the OT to the work sheet, and still reads the old form by text", () => {
    expect(readOvertimeForm({ text: "", lines: question2, circles: [{ x: 80, y: 1318 }] })).toEqual({ ot: null, clientMinutes: 30, returnMinutes: null });
    expect(readOvertimeForm({ text: "3. Numéro du OT-XXXXXX\nOT-208637\n4. Combien de minute chez le client\n60", lines: [], circles: [] }).clientMinutes).toBe(60);
  });

  it("recognises the new form as the overtime form, and a text message as not being it", () => {
    expect(isOvertimeFormText("Confirmation de surtemps - D...\n2. Durée réelle du temps supplémentaire (Minutes) *\n0\n15")).toBe(true);
    expect(isOvertimeFormText("3. Durée du retour *\n0\n15\n4. Commentaire *")).toBe(false); // one mark only: refused rather than trusted
    expect(isOvertimeFormText("Demande de temps supplémentaire approuvé. Quand votre surtemps est complété remplissez se formulaire svp")).toBe(false);
  });
});

describe("new form: partial captures (no title, one question, half-hidden circle)", () => {
  const Q2_ONLY = "forms.cloud.microsoft\n1. Ordre de travail *\nOT-270185\n2. Durée réelle du temps supplémentaire (Minutes) *\n60 minutes = 1h, 75 minutes =1h15, 90 minutes =\n0\n15\n30\n45";
  const Q3_ONLY = "3. Durée du retour *\n0\n15\n30\n45\n60\n75\n90\n105\n120\n+ de 120 minutes\n4. Commentaire *\nBeaucoup de temps avec SALC";

  it("recognises a capture that shows only question 2 (no title) or only question 3 as the form, not as a wrong document", () => {
    expect(isOvertimeFormText(Q2_ONLY)).toBe(true);
    expect(isOvertimeFormText(Q3_ONLY)).toBe(true);
    expect(isOvertimeFormText("Ordre de travail OT-198909\nBilan\nTemps total 5 h")).toBe(false); // a work order is still refused
  });

  it("reads the OT of question 1 together with the ticked answer", () => {
    const lines = [
      { text: "1. Ordre de travail *", top: 230, height: 30 },
      { text: "OT-270185", top: 290, height: 30 },
      { text: "2. Durée réelle du temps supplémentaire", top: 380, height: 30 },
      { text: "(Minutes) *", top: 410, height: 30 },
      ...["0", "15", "30", "45", "60", "75", "90", "105"].map((text, i) => ({ text, top: 505 + i * 60, height: 24 })),
    ];
    const read = readOvertimeForm({ text: Q2_ONLY, lines, circles: [{ x: 150, y: 697 }] });
    expect(read).toEqual({ ot: "270185", clientMinutes: 45, returnMinutes: null });
  });

  it("takes a half-hidden circle (two possible centres) when both land on the same choice", () => {
    const lines = [
      { text: "2. Durée réelle du temps supplémentaire", top: 100, height: 30 },
      ...["0", "15", "30", "45", "60", "75", "90", "105", "120"].map((text, i) => ({ text, top: 200 + i * 60, height: 24 })),
    ];
    // « 120 » is the 9th choice: centre 200 + 8 × 60 + 12 = 692; the circle is cut by the bottom bar: two centres 8 px apart.
    expect(parseRadioAnswers(lines, [{ x: 140, y: 696, altY: 686 }]).clientMinutes).toBe(120);
    // two centres that land on two different choices: not guessed
    expect(parseRadioAnswers(lines, [{ x: 140, y: 692, altY: 632 }]).clientMinutes).toBeNull();
  });
});
