import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260928233000_0067_keep_overtime_evidence_per_day.sql",
  import.meta.url
)), "utf8");

const lastJobSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260929003000_0068_attach_overtime_evidence_to_last_job.sql",
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

describe("the screenshot sits on the day's last job", () => {
  it("re-attaches on capture and on every job insert, re-time, re-flag or delete", () => {
    expect(lastJobSql).toContain("after insert on public.overtime_evidence");
    expect(lastJobSql).toContain("after insert or update of job_date, depart, fin, overtime_evidence_captured on public.jobs");
    expect(lastJobSql).toContain("perform public.attach_overtime_evidence_to_last_job(old.user_id, old.job_date)");
  });

  it("picks the job with the latest end, like the timesheet clock marker", () => {
    expect(lastJobSql).toContain("order by j.ended_at desc nulls last, j.fin desc nulls last, j.id desc");
    expect(lastJobSql).toContain("set overtime_evidence_captured = (j.id = last_job)");
  });

  it("points the manager notification at the job holding the screenshot", () => {
    expect(lastJobSql).toContain("before insert on public.manager_notifications");
  });
});
