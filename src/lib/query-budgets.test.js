import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QUERY_BUDGETS, shouldLoadAllMatchingManagerJobs } from "./query-budgets";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260927025307_0064_query_budgets_and_aggregates.sql",
  import.meta.url
)), "utf8");

describe("query budgets", () => {
  it("keeps interactive pages bounded", () => {
    expect(QUERY_BUDGETS.managerJobsPage).toBeGreaterThanOrEqual(25);
    expect(QUERY_BUDGETS.managerJobsPage).toBeLessThanOrEqual(100);
    expect(QUERY_BUDGETS.reviewQueue).toBeLessThanOrEqual(100);
    expect(QUERY_BUDGETS.employeeHistoryPage).toBeLessThanOrEqual(100);
    expect(QUERY_BUDGETS.employeeWeekLookbackWeeks).toBeLessThanOrEqual(12);
    expect(QUERY_BUDGETS.anomalySubmittedJobs).toBeLessThanOrEqual(200);
    expect(QUERY_BUDGETS.anomalyApprovedPeers).toBeLessThanOrEqual(400);
    expect(QUERY_BUDGETS.employeeActivityPage).toBeLessThanOrEqual(200);
  });

  it("loads every page when the manager narrows by employee or day", () => {
    expect(shouldLoadAllMatchingManagerJobs("employee-id", "")).toBe(true);
    expect(shouldLoadAllMatchingManagerJobs("all", "2026-09-29")).toBe(true);
    expect(shouldLoadAllMatchingManagerJobs("employee-id", "2026-09-29")).toBe(true);
    expect(shouldLoadAllMatchingManagerJobs("all", "")).toBe(false);
  });

  it("locks aggregate counts and keyset/review indexes into the database contract", () => {
    expect(migrationSql).toContain("count(*) filter (where j.status = 'submitted')");
    expect(migrationSql).toContain("jobs_manager_keyset_idx");
    expect(migrationSql).toContain("parking_receipts_pending_created_idx");
    expect(migrationSql).toContain("meal_claims_pending_created_idx");
  });
});
