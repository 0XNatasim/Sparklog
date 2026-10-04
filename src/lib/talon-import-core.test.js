import { describe, expect, it } from "vitest";
import { buildTalonFromItems, chainHoursFromPrevious, correctLegacyHours } from "./talon-import-core";

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

describe("chainHoursFromPrevious", () => {
  // S16 (D0009-0009): legacy cumulative 119 h (58 = 29 + 29 premium); S15 is in the register at 31,5 h.
  it("takes the previous registry hours + this week's real hours (31,5 + 29 = 60,5)", () => {
    const talon = { sommaire: sommaire(58, 119), ytd: { hoursYtd: 119 } };
    correctLegacyHours(transactionsS16(), talon.sommaire, talon.ytd); // period 58 → 29, cumulative 119 → 90
    expect(talon.ytd.hoursYtd).toBe(90);
    const chained = chainHoursFromPrevious(talon, 31.5);
    expect(chained).toEqual({ previousHours: 31.5, periodHours: 29, total: 60.5 });
    expect(talon.ytd.hoursYtd).toBe(60.5);
    expect(talon.sommaire[0]).toMatchObject({ periode: 29, cumulatif: 60.5 }); // Heures AE
    expect(talon.sommaire[1]).toMatchObject({ periode: 29, cumulatif: 60.5 }); // Heures
  });

  it("does nothing without a previous week or an hours row", () => {
    expect(chainHoursFromPrevious({ sommaire: sommaire(31.5, 31.5), ytd: {} }, undefined)).toBeNull();
    expect(chainHoursFromPrevious({ sommaire: [], ytd: {} }, 10)).toBeNull();
  });
});

function transactionsS16() {
  return [
    { description: "Salaire régulier fixe", unite: 29, taux: 45.36, montant: 1315.44 },
    { description: "Temps double", unite: null, taux: 90.72, montant: 0 },
    { description: "Régulier à taux horaire", unite: 29, taux: 3, montant: 87 },
    { description: "indeminité utilisation véhicule", unite: 753, taux: 0.65, montant: 489.45 },
  ];
}

describe("buildTalonFromItems — wide rate in the Unité band (stub D0031-0008, S35)", () => {
  const at = (s, x, y) => ({ s, x, y, page: 1 });
  const items = [
    at("Transactions", 40, 520), at("Sommaire", 300, 520),
    at("Description", 30, 500), at("Unité", 120, 500), at("Taux", 165, 500), at("Montant", 205, 500),
    at("Salaire régulier fixe", 30, 480), at("36.50", 125, 480), at("50.7900", 160, 480), at("$1,853.84", 200, 480),
    at("Temps double", 30, 470), at("101.5800", 140, 470), at("$0.00", 205, 470), // no units; the rate starts in the Unité band
    at("Régulier à taux horaire", 30, 460), at("36.50", 125, 460), at("4.0600", 165, 460), at("$148.19", 205, 460),
    at("Heures", 240, 480), at("73.00", 330, 480), at("73.00", 380, 480),
  ];
  it("reads the wide rate as a rate and still corrects the doubled hours (73 → 36,5)", () => {
    const talon = buildTalonFromItems(items);
    const double = talon.transactions.find((r) => r.description === "Temps double");
    expect(double).toMatchObject({ unite: null, taux: 101.58, montant: 0 });
    expect(talon.hoursCorrection).toEqual({ legacyHours: 73, paidHours: 36.5, excess: 36.5 });
    expect(talon.sommaire.find((r) => r.key === "hoursYtd")).toMatchObject({ periode: 36.5, cumulatif: 36.5 });
  });
});
