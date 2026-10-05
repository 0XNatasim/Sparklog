import { describe, expect, it } from "vitest";
import { buildClosing } from "./payroll-closing";
import { buildCalculTalon } from "./calcul-talon";

// S40 (D0035-0036): 40 h fixed at 50,79 + prime 4,06 on 40 h, 346 km, cellular 2 × 7, other 7,11.
const pay = { regularHours: 40, ot150Hours: 0, ot200Hours: 0, returnNbHours: 0, baseOnlyHours: 0, baseRate: 50.79, premium: 4.06, km: 346, kmRate: 0.65 };
const reimb = { km: 224.9, phone: 14, other: 7.11 };
const result = {
  gross: { total: 2194, cashTotal: 2194 },
  employee: { federalTax: 259.95, quebecTax: 352.25, rrq: { total: 159.13 }, ei: 31.96, rqap: 10.57 },
  ytdAfter: {},
};
const opening = { regularEarnings: 40660.43, doubleTime: 1158.5, vacationPay: 30.68, kmIndemnity: 9435.4, otherIncome: 147, hoursYtd: 803.5, quebecTax: 6156.44 };
const closing = buildClosing({ opening, result, ccq: null, reimb, pay });
const talon = buildCalculTalon({
  opening, closing, result, ccq: null, reimb, pay,
  employee: { full_name: "Simon Bellerive", employee_number: "09", ccq_number: "9477" },
  week: { periodStart: "2026-09-20", periodEnd: "2026-09-26", weekNo: 40 }, reference: "D0035-0036", payDate: "2026-10-01",
});
const som = (d) => talon.sommaire.find((r) => r.description === d);
const tx = (d, i = 0) => talon.transactions.filter((r) => r.description === d)[i];

describe("buildCalculTalon — talon gardé depuis Calcul (S40)", () => {
  it("marque la source et reprend l'en-tête", () => {
    expect(talon.header).toMatchObject({ source: "calcul", name: "Simon Bellerive", ref: "D0035-0036", week: "40", periodEnd: "2026-09-26" });
  });
  it("Transactions : lignes imprimées (prime 162,40 ; KM 224,90 ; cellulaire 2 × 7 ; autre 7,11)", () => {
    expect(tx("Salaire régulier fixe")).toMatchObject({ unite: 40, taux: 50.79, montant: 2031.6 });
    expect(tx("Régulier à taux horaire")).toMatchObject({ unite: 40, taux: 4.06, montant: 162.4 });
    expect(tx("Indemnité utilisation véhicule")).toMatchObject({ unite: 346, montant: 224.9 });
    expect(tx("Remboursement données cellulaire")).toMatchObject({ unite: 2, taux: 7, montant: 14 });
    expect(tx("Autre revenu non imposable (à verser)").montant).toBe(7.11);
  });
  it("Sommaire : période = registre de la semaine − ouverture, cumulatif = registre", () => {
    expect(som("Heures")).toMatchObject({ periode: 40, cumulatif: 843.5 });
    expect(som("Heures AE")).toMatchObject({ periode: 40, cumulatif: 843.5, key: null });
    expect(som("Vacances")).toMatchObject({ periode: 6.5, cumulatif: 37.18 });
    expect(som("Autre Revenu 1")).toMatchObject({ periode: 21.11, cumulatif: 168.11 });
    expect(som("Indemnité KM (utilisation véhicule personnel)")).toMatchObject({ periode: 224.9, cumulatif: 9660.3 });
  });
  it("omet les lignes facultatives qui ne bougent pas (temps double à 0)", () => {
    expect(som("Temps double")).toBeUndefined();
  });
  it("En-tête : Gains, Retenues et Paie nette (Net + remboursements) de payTotals, sans bloc CCQ", () => {
    expect(talon.header.gains).toBe("2,440.01");
    expect(talon.header.retenues).toBe("813.86");
    expect(talon.header.paieNette).toBe("1,626.15");
  });
});
