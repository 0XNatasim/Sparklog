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
    // The card is split in src/components/employees/ (V2.4.178): « Données CCQ » is its own file.
    const ccqSection = read("src/components/employees/EmployeeCcqSection.jsx");
    const src = read("src/components/employees/EmployeeContactSection.jsx");
    expect(ccqSection).toContain('t("employees.ccqExport")');
    expect(ccqSection).not.toContain("birth_date");
    expect(ccqSection).not.toContain("NasField");
    expect(src.match(/<NasField /g)).toHaveLength(1);
    expect(src).toContain('"birth_date"');
    expect(src).toContain('saveEmploymentDate(p, "start_date"');
    expect(src).toContain('saveEmploymentDate(p, "last_work_date"');
  });
});

describe("date de réembauche (0119)", () => {
  it("refuses a rehire date before the hiring date, like the database; a last day before it is allowed", () => {
    expect(employmentDatesError("2026-04-06", null, "2026-04-05")).toBe("employees.dates.rehireOrder");
    expect(employmentDatesError("2026-04-06", null, "2026-04-06")).toBeNull();
    expect(employmentDatesError("2026-04-06", "2026-06-12", "2026-08-31")).toBeNull();
    const sql = read("supabase/migrations/20261027200000_0119_rehire_date.sql");
    expect(sql).toContain("check (rehire_date is null or start_date is null or rehire_date >= start_date)");
    for (const action of ["role_change", "pause_change", "departure_change", "start_date_change", "last_work_date_change", "rehire_date_change"]) {
      expect(sql).toContain(`'${action}'`);
    }
  });

  it("starts the Record of employment at the rehire date and ignores the earlier departure", () => {
    const computed = { firstDay: "2026-04-05", lastDay: "2026-10-22" };
    // Hired in April, laid off in June, back in August: block 10 = the return, block 11 from the pay data.
    expect(roeEmploymentDates(computed, { start_date: "2026-04-07", last_work_date: "2026-06-12", rehire_date: "2026-08-31" }))
      .toEqual({ firstDay: "2026-08-31", lastDay: "2026-10-22" });
    // Gone again after the return: the last day worked counts.
    expect(roeEmploymentDates(computed, { start_date: "2026-04-07", last_work_date: "2026-10-20", rehire_date: "2026-08-31" }))
      .toEqual({ firstDay: "2026-08-31", lastDay: "2026-10-20" });
  });

  it("is in the card next to the hiring date, saved like the other dates", () => {
    const src = read("src/components/employees/EmployeeContactSection.jsx");
    expect(src).toContain('saveEmploymentDate(p, "rehire_date"');
    expect(read("src/components/EmployeesPanel.jsx")).toContain("rehire_date");
    expect(read("src/components/RecordOfEmploymentTab.jsx")).toContain("rehire_date");
  });
});
