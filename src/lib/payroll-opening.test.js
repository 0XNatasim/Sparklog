import { describe, expect, it } from "vitest";
import { DYNACOM_CUMULATIVE_END, isClosedBeforeSparklog, isDynacomOnlyWeek } from "./payroll-opening";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { friendlyErrorMessage } from "./error-messages";

describe("weeks paid by Dynacom before Sparklog", () => {
  it("covers every week ending before the imported cumulative (week 41 and earlier)", () => {
    expect(isDynacomOnlyWeek("2026-10-03")).toBe(true);
    expect(isDynacomOnlyWeek("2026-04-04")).toBe(true);
  });

  it("leaves the cumulative's own week (42) and the next ones to Sparklog", () => {
    expect(isDynacomOnlyWeek(DYNACOM_CUMULATIVE_END)).toBe(false);
    expect(isDynacomOnlyWeek("2026-10-17")).toBe(false);
    expect(isDynacomOnlyWeek("")).toBe(false);
  });
});

describe("the Dynacom cumulative lock (week 42 and before)", () => {
  const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("closes every week up to and including the cumulative's week", () => {
    expect(isClosedBeforeSparklog("2026-10-10")).toBe(true); // week 42
    expect(isClosedBeforeSparklog("2026-10-03")).toBe(true);
    expect(isClosedBeforeSparklog("2026-10-17")).toBe(false); // week 43
    expect(isClosedBeforeSparklog("")).toBe(false);
  });

  it("is enforced by the database on the same date, for computed closings only", () => {
    const sql = read("../../supabase/migrations/20261017030000_0099_protect_dynacom_cumulative.sql");
    expect(sql).toContain(`cutoff constant date := date '${DYNACOM_CUMULATIVE_END}'`);
    expect(sql).toContain("before insert or update or delete on public.payroll_period_ledger");
    expect(sql).toContain("<> 'calcul'");
    expect(sql).toContain("'boss_approved', 'boss_approved_by', 'boss_approved_at'");
    expect(sql).toContain("if auth.uid() is null then");
  });

  it("blocks Calcul's Comptabiliser and explains it", () => {
    expect(read("../components/PayrollEngineTester.jsx")).toContain("if (isClosedBeforeSparklog(periodEnd)) {");
    const t = (key) => key;
    expect(friendlyErrorMessage({ message: "dynacom_cumulative_locked" }, t, "fallback")).toBe("payroll.postClosedWeek");
  });
});

