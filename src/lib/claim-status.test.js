import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COUNTED_CLAIM_STATUSES } from "./claim-status";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// Every report that adds up supper or parking amounts leaves refused claims out. Coûts and
// Semaine / Mois read them through employer-cost-data.js (V2.4.181).
const REPORTS = ["./employer-cost-data.js", "../components/WeeklyReportButton.jsx"];

describe("supper / parking amounts in reports", () => {
  it("count pending and accepted claims, never refused ones", () => {
    expect(COUNTED_CLAIM_STATUSES).toEqual(["pending", "approved"]);
    expect(COUNTED_CLAIM_STATUSES).not.toContain("rejected");
  });

  it("Coûts and Semaine / Mois load their claims through the shared loader", () => {
    for (const file of ["../components/PeriodSummary.jsx", "../components/CostingDashboard.jsx"]) {
      const source = read(file);
      expect(source).toContain("loadCostInputs(");
      expect(source).not.toMatch(/from\("(meal_claims|parking_receipts)"\)/);
    }
  });

  for (const file of REPORTS) {
    it(`${file.split("/").pop()} filters both claim tables by status`, () => {
      const source = read(file);
      for (const table of ["meal_claims", "parking_receipts"]) {
        const reads = source.match(new RegExp(`from\\("${table}"\\)[^\\n]*`, "g")) || [];
        expect(reads.length).toBeGreaterThan(0);
        for (const line of reads) expect(line).toContain('.in("status", COUNTED_CLAIM_STATUSES)');
      }
    });
  }
});
