import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const { employmentDatesError, roeEmploymentDates } = await import("@/lib/signups");
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("date d'embauche et dernier jour travaillé (0115)", () => {
  it("refuses a last day before the hiring date, like the database", () => {
    expect(employmentDatesError("2026-04-06", "2026-04-05")).toBe("employees.dates.order");
    expect(employmentDatesError("2026-04-06", "2026-04-06")).toBeNull();
    expect(employmentDatesError("2026-04-06", null)).toBeNull();
    expect(employmentDatesError(null, "2026-01-01")).toBeNull();
    const sql = read("supabase/migrations/20261023180000_0115_last_work_date.sql");
    expect(sql).toContain("check (last_work_date is null or start_date is null or last_work_date >= start_date)");
  });

  it("logs every change in the Journal and keeps the earlier entries", () => {
    const sql = read("supabase/migrations/20261023180000_0115_last_work_date.sql");
    for (const action of ["role_change", "pause_change", "departure_change", "start_date_change", "last_work_date_change"]) {
      expect(sql).toContain(`'${action}'`);
    }
  });

  it("the Record of employment uses the card dates when filled", () => {
    const computed = { firstDay: "2026-10-04", lastDay: "2026-10-22" };
    expect(roeEmploymentDates(computed, { start_date: "2026-04-07", last_work_date: "2026-10-20" }))
      .toEqual({ firstDay: "2026-04-07", lastDay: "2026-10-20" });
    expect(roeEmploymentDates(computed, {})).toEqual(computed);
    expect(roeEmploymentDates(computed, null)).toEqual(computed);
  });

  it("birth date and SIN are in the card itself, no longer in « Données CCQ »", () => {
    const src = read("src/components/EmployeesPanel.jsx");
    const ccqStart = src.indexOf('t("employees.ccqExport")');
    const ccqEnd = src.indexOf("</details>", ccqStart);
    const ccqSection = src.slice(ccqStart, ccqEnd);
    expect(ccqSection).not.toContain("birth_date");
    expect(ccqSection).not.toContain("NasField");
    expect(src.match(/<NasField /g)).toHaveLength(1);
    expect(src).toContain('saveEmploymentDate(p, "start_date"');
    expect(src).toContain('saveEmploymentDate(p, "last_work_date"');
  });
});
