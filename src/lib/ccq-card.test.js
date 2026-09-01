import { describe, it, expect } from "vitest";
import { parseCcqCard } from "./ccq-card";

describe("parseCcqCard", () => {
  const sample = `COMMISSION DE LA CONSTRUCTION DU QUEBEC
CERTIFICAT DE COMPETENCE COMPAGNON
DATE DE NAISSANCE *1984-06-20*  REGION *08*
DELIVRANCE *2026-05-20*  ECHEANCE *2027-06-01*
No CLIENT **1434-1226**`;

  it("extracts CCQ number, expiration and birth date from a card", () => {
    const r = parseCcqCard(sample);
    expect(r.ccqNumber).toBe("1434-1226");
    expect(r.expiration).toBe("2027-06-01");
    expect(r.birth).toBe("1984-06-20");
  });

  it("falls back to chronology when labels are unreadable (oldest=birth, newest=expiry)", () => {
    const r = parseCcqCard("2027-06-01 x 1984-06-20 y 2026-05-20 client 1434-1226");
    expect(r.birth).toBe("1984-06-20");
    expect(r.expiration).toBe("2027-06-01");
    expect(r.ccqNumber).toBe("1434-1226");
  });

  it("returns nulls on empty input", () => {
    const r = parseCcqCard("");
    expect(r.ccqNumber).toBeNull();
    expect(r.expiration).toBeNull();
    expect(r.birth).toBeNull();
  });
});
