import { describe, expect, it } from "vitest";
import { correctLegacyHours } from "./talon-import-core";

// Talon D0008-0009 (week of 2026-03-29): the legacy software reported 61 h because it also
// counted the 29.5 units of the "Régulier à taux horaire" premium line.
const transactions = () => [
  { description: "Salaire régulier fixe", unite: 29.5, taux: 45.36, montant: 1338.12 },
  { description: "Temps et demi", unite: null, taux: 68.04, montant: 0 },
  { description: "Temps double", unite: 2, taux: 90.72, montant: 181.44 },
  { description: "Équipement de sécurité", unite: null, taux: 0.65, montant: 20.48 },
  { description: "Régulier à taux horaire", unite: 29.5, taux: 3, montant: 88.5 },
  { description: "indeminité utilisation véhicule", unite: 557, taux: 0.65, montant: 362.05 },
  { description: "remboursement données cellulaire", unite: 1, taux: 7, montant: 7 },
];
const sommaire = (periode = 61, cumulatif = 61) => [
  { description: "Heures AE", key: null, periode, cumulatif },
  { description: "Heures", key: "hoursYtd", periode, cumulatif },
  { description: "Gains AE", key: "insurableIncomeEI", periode: 1805.6, cumulatif: 1805.6 },
];

describe("correctLegacyHours", () => {
  it("counts only régulier + temps et demi + temps double (29.5 + 2 = 31.5 h)", () => {
    const rows = sommaire();
    const ytd = { hoursYtd: 61 };
    const fix = correctLegacyHours(transactions(), rows, ytd);
    expect(fix).toEqual({ legacyHours: 61, paidHours: 31.5, excess: 29.5 });
    expect(rows[0]).toMatchObject({ periode: 31.5, cumulatif: 31.5 });
    expect(rows[1]).toMatchObject({ periode: 31.5, cumulatif: 31.5 });
    expect(ytd.hoursYtd).toBe(31.5);
    expect(rows[2].periode).toBe(1805.6); // other lines untouched
  });

  it("removes only this week's excess from a later cumulative", () => {
    const rows = sommaire(61, 1000);
    const ytd = { hoursYtd: 1000 };
    correctLegacyHours(transactions(), rows, ytd);
    expect(rows[1]).toMatchObject({ periode: 31.5, cumulatif: 970.5 });
    expect(ytd.hoursYtd).toBe(970.5);
  });

  it("leaves a stub that is already right alone", () => {
    const rows = sommaire(31.5, 31.5);
    expect(correctLegacyHours(transactions(), rows, { hoursYtd: 31.5 })).toBeNull();
    expect(rows[1].periode).toBe(31.5);
  });

  it("does nothing when no hour line can be identified", () => {
    const rows = sommaire();
    expect(correctLegacyHours([{ description: "Autre", unite: 5, taux: 1, montant: 5 }], rows, { hoursYtd: 61 })).toBeNull();
    expect(rows[1].periode).toBe(61);
  });
});
