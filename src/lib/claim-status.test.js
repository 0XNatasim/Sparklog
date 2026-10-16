import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COUNTED_CLAIM_STATUSES } from "./claim-status";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// Every report that adds up supper or parking amounts leaves refused claims out.
const REPORTS = ["../components/PeriodSummary.jsx", "../components/CostingDashboard.jsx", "../components/WeeklyReportButton.jsx"];

describe("supper / parking amounts in reports", () => {
  it("count pending and accepted claims, never refused ones", () => {
    expect(COUNTED_CLAIM_STATUSES).toEqual(["pending", "approved"]);
    expect(COUNTED_CLAIM_STATUSES).not.toContain("rejected");
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
