import { describe, expect, it } from "vitest";
import { batchRowIssues, ledgerPayloadFor, matchStubEmployee, weekStartFromEnd } from "./talon-batch";

const employees = [
  { id: "simon", full_name: "Simon B.", employee_number: "09" },
  { id: "erika", full_name: "Érika Dubuc", employee_number: "12" },
  { id: "pascal", full_name: "Pascal Dubuc", employee_number: "14" },
  { id: "jc", full_name: "Jean-Christophe Bouthillier", employee_number: "" },
  { id: "steeve-d", full_name: "Steeve Danis" },
  { id: "steeve-s", full_name: "Steeve Simard" },
];

describe("matchStubEmployee", () => {
  it("matches the exact name, accents and case aside", () => {
    expect(matchStubEmployee({ name: "ERIKA DUBUC" }, employees)).toEqual({ userId: "erika", how: "name" });
    expect(matchStubEmployee({ name: "Jean Christophe Bouthillier" }, employees)).toEqual({ userId: "jc", how: "name" });
  });

  it("matches a profile written with an initial (Simon B. ↔ Simon Bellerive)", () => {
    expect(matchStubEmployee({ name: "Simon Bellerive", employeeNumber: "09" }, employees)).toEqual({ userId: "simon", how: "name" });
  });

  it("never guesses between two people with the same first name", () => {
    expect(matchStubEmployee({ name: "Steeve D" }, employees)).toEqual({ userId: "steeve-d", how: "name" });
    expect(matchStubEmployee({ name: "Steeve" }, employees).userId).toBe("");
  });

  it("falls back to the employee number only when no name fits (flagged)", () => {
    expect(matchStubEmployee({ name: "Unknown Person", employeeNumber: "014" }, employees)).toEqual({ userId: "pascal", how: "number" });
    expect(matchStubEmployee({ name: "Unknown Person", employeeNumber: "99" }, employees)).toEqual({ userId: "", how: "none" });
  });
});

describe("ledgerPayloadFor", () => {
  const talon = {
    header: { name: "Simon Bellerive", periodStart: "2026-10-04", periodEnd: "2026-10-10" },
    transactions: [{ description: "Salaire régulier fixe", unite: 38.5, taux: 50.79, montant: 1955.42 }],
    sommaire: [{ key: "pensionableIncomeRRQ", description: "Gains RRQ", periode: 2820.9, cumulatif: 57861.57 }],
    ytd: { pensionableIncomeRRQ: 57861.57 },
    periodEnd: "2026-10-10",
  };

  it("builds the same week row as the one-by-one import", () => {
    const row = ledgerPayloadFor({ userId: "simon", talon });
    expect(row).toMatchObject({ user_id: "simon", tax_year: 2026, period_end: "2026-10-10", period_start: "2026-10-04" });
    expect(row.imported_talon.header).toMatchObject({ periodEnd: "2026-10-10", periodStart: "2026-10-04" });
    expect(Object.values(row)).toContain(57861.57);
  });

  it("weekStartFromEnd is the Sunday of the CCQ week", () => {
    expect(weekStartFromEnd("2026-10-10")).toBe("2026-10-04");
  });
});

describe("batchRowIssues", () => {
  const ok = { userId: "simon", periodEnd: "2026-10-10", talon: { ytd: { a: 1 } } };
  it("is empty for a complete row", () => {
    expect(batchRowIssues(ok, [ok])).toEqual([]);
  });
  it("flags a missing employee, period, cumulative and a duplicate week", () => {
    expect(batchRowIssues({ ...ok, userId: "" })).toEqual(["noEmployee"]);
    expect(batchRowIssues({ ...ok, periodEnd: "" })).toEqual(["noPeriod"]);
    expect(batchRowIssues({ ...ok, talon: { ytd: {} } })).toEqual(["noCumul"]);
    const twin = { ...ok };
    expect(batchRowIssues(ok, [ok, twin])).toEqual(["duplicate"]);
    expect(batchRowIssues({ error: "x" })).toEqual(["error"]);
  });
});
