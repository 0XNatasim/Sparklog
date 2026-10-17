import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Every fixed holiday date of convention ICI 2025-2029, art. 19.04 1) b) and 3), for the years
// Sparklog runs (2026-2028), must be in company_holidays (written by migration 0098).
const CONVENTION_2026_2028 = [
  "2026-04-03", "2026-04-06", "2026-05-18", "2026-06-24", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-13",
  "2027-03-26", "2027-03-29", "2027-05-24", "2027-06-24", "2027-07-02", "2027-09-06", "2027-10-11", "2027-11-12",
  "2028-04-14", "2028-04-17", "2028-05-22", "2028-06-23", "2028-06-30", "2028-09-04", "2028-10-09", "2028-11-10",
];

const dir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const sql = readFileSync(dir + readdirSync(dir).find((f) => f.endsWith("_0098_company_holidays_convention.sql")), "utf8");

describe("company_holidays", () => {
  it("holds every fixed holiday of the convention for 2026-2028", () => {
    const missing = CONVENTION_2026_2028.filter((date) => !sql.includes(`'${date}'`));
    expect(missing).toEqual([]);
  });
});
