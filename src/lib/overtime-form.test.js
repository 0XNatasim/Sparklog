import { describe, expect, it } from "vitest";
import { isOvertimeFormText, overtimeFormFound, parseOvertimeForm } from "./overtime-form";

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
