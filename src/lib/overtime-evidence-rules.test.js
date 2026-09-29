import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260928233000_0067_keep_overtime_evidence_per_day.sql",
  import.meta.url
)), "utf8");

const mealFunction = migrationSql.slice(
  migrationSql.indexOf("create or replace function public.reconcile_overtime_meal"),
  migrationSql.indexOf("create or replace function public.rehome_overtime_evidence_before_job_delete"),
);

// The overtime screenshot is one per employee per day, asked for on whichever job is
// saved when the day passes 8h. The database must not keep it only on the job that
// crosses 8h chronologically, or days entered out of order lose it (2026-09-28).
describe("overtime evidence is kept at the day level", () => {
  it("meal reconciliation no longer deletes overtime evidence or its flag", () => {
    expect(mealFunction).toContain("delete from public.meal_claims");
    expect(mealFunction).not.toContain("overtime_evidence");
  });

  it("moves the screenshot to another job of the day when its job is deleted", () => {
    expect(migrationSql).toContain("before delete on public.jobs");
    expect(migrationSql).toContain("update public.overtime_evidence set job_id = target");
    expect(migrationSql).toContain("after delete on public.jobs");
    expect(migrationSql).toContain("set overtime_evidence_captured = true");
  });
});
