import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeEmployeeWeekTalon, weekCongesIndemnity } from "./employee-week.js";
import { CCQ_ELECTRICIAN_IC_C3 } from "./ccq-benefits.js";
import { CONGES_INDEMNITY_RATES } from "@/lib/payroll-calculations";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// Convention ICI 2025-2029, art. 19.05 1): 13 % of the wage earned each week, « soit 6 % en congés
// annuels obligatoires, 5,5 % en jours fériés chômés et 1,5 % en congés de maladie ».
const profile = { hourly_rate: 50.79, km_rate: 0.65, apprentice_level: "compagnon", union_association: "FTQ" };
const job = (id, date, depart, fin, extra = {}) => ({ id, user_id: "u1", job_date: date, depart, arrivee: depart, fin, km_total: 10, status: "approved", ...extra });

// Week 42 (Sun 2026-10-11 → Sat 2026-10-17) with Thanksgiving on Monday: nobody works it.
const WEEKS = {
  plain: [job("a", "2026-10-13", "07:00", "15:00"), job("b", "2026-10-14", "07:00", "15:00")],
  overtime: [job("a", "2026-10-13", "07:00", "18:30"), job("b", "2026-10-14", "07:00", "17:00"), job("c", "2026-10-15", "06:00", "18:00")],
  returnTime: [job("a", "2026-10-13", "07:00", "17:30", { return_time_minutes: 120 }), job("b", "2026-10-14", "07:00", "15:00", { return_time_minutes: 60 })],
};
const PROFILES = {
  journeyman: profile,
  nonCcqPremium: { ...profile, team_leader_premium: 4.06 },
  ccqPremium: { ...profile, team_leader_premium_ccq: 4.06 },
  ccqPremiumOnOvertime: { ...profile, team_leader_premium_ccq: 4.06, team_leader_premium_overtime: true },
  firstHourDouble: { ...profile, overtime_first_hour_double: true },
  apprentice: { ...profile, hourly_rate: 30.47, apprentice_level: "apprenti_1" },
};

describe("13 % indemnité de congés (convention 19.05)", () => {
  it("is 6 % + 5,5 % + 1,5 % = 13 % everywhere", () => {
    expect(CONGES_INDEMNITY_RATES).toEqual({ vacation: 0.06, statutoryHolidays: 0.055, sick: 0.015 });
    const sum = CONGES_INDEMNITY_RATES.vacation + CONGES_INDEMNITY_RATES.statutoryHolidays + CONGES_INDEMNITY_RATES.sick;
    expect(sum).toBeCloseTo(CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate, 10);
    expect(CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate).toBe(0.13);
  });

  for (const [weekName, jobs] of Object.entries(WEEKS)) {
    for (const [profileName, p] of Object.entries(PROFILES)) {
      for (const messierMethod of [true, false]) {
        it(`matches the talon to the cent — ${weekName}, ${profileName}, ${messierMethod ? "Messier" : "référence"}`, () => {
          const talon = computeEmployeeWeekTalon({ profile: p, jobs, weekDate: "2026-10-11", messierMethod, holidayDates: ["2026-10-12"] });
          const indemnity = weekCongesIndemnity({ profile: p, jobs, messierMethod, holidayDates: ["2026-10-12"] });
          expect(indemnity.total).toBe(talon.ccqAmounts.vacation);
          expect(indemnity.vacation + indemnity.statutoryHolidays + indemnity.sick).toBeCloseTo(indemnity.total, 10);
        });
      }
    }
  }

  it("leaves the non-CCQ premium and return time without benefits out of the base", () => {
    const base = weekCongesIndemnity({ profile, jobs: WEEKS.plain });
    expect(base.base).toBe(Math.round(16 * 50.79 * 100) / 100);
    expect(base.total).toBe(Math.round(16 * 50.79 * 0.13 * 100) / 100);
    expect(weekCongesIndemnity({ profile: PROFILES.nonCcqPremium, jobs: WEEKS.plain }).total).toBe(base.total);
    expect(base.statutoryHolidays).toBe(Math.round(16 * 50.79 * 0.055 * 100) / 100);
  });

  it("is what Coûts, Semaine/mois and the printed summary use (same method and options as the talons)", () => {
    for (const file of ["../components/CostingDashboard.jsx", "../components/PeriodSummary.jsx"]) {
      const source = read(file);
      expect(source).toContain("congesOverWeeks({");
      expect(source).not.toContain("calculateCongesIndemnity(");
    }
    expect(read("../lib/weekly-report.js")).toContain("messierMethod");
  });
});
