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

const requiredOnSubmitSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260929200000_0069_require_daily_overtime_evidence.sql",
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

describe("overtime evidence is mandatory at every submission boundary", () => {
  it("counts saved through approved jobs and rejects a day over 8 h without proof", () => {
    expect(requiredOnSubmitSql).toContain("j.status in ('saved', 'updated', 'submitted', 'approved')");
    expect(requiredOnSubmitSql).toContain("duration_minutes + other_minutes > 480");
    expect(requiredOnSubmitSql).toContain("message = 'overtime_evidence_required'");
  });
});

// Phase 9a (0143): a day may carry several proofs, one per work order past the 8 h line.
describe("several overtime proofs on one day (0143)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261117180000_0143_overtime_evidence_several_per_day.sql", import.meta.url)), "utf8");

  it("drops the one-proof-per-job constraint and keeps the lookups indexed", () => {
    expect(sql).toContain("drop constraint if exists overtime_evidence_job_id_key");
    expect(sql).toContain("create index if not exists overtime_evidence_job_id_idx on public.overtime_evidence (job_id)");
  });

  it("leaves the day-level rules alone: still attached to the last job, still at least one proof to submit", () => {
    expect(sql).not.toMatch(/create or replace function/i);
    expect(lastJobSql).toContain("set job_id = last_job");
    expect(requiredOnSubmitSql).toContain("message = 'overtime_evidence_required'");
  });
});

// Phase 10 (0144): each proof stays on its own work order; the employee reads and manages their own.
describe("overtime proof per work order (0144)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261118120000_0144_overtime_proof_per_job.sql", import.meta.url)), "utf8");
  const attach = sql.slice(sql.indexOf("create or replace function public.attach_overtime_evidence_to_last_job"), sql.indexOf("-- 2. The employee's own proofs"));

  it("stops moving the proofs onto the last job: it only syncs each job's flag with its own proofs", () => {
    expect(attach).not.toMatch(/set job_id\s*=/);
    expect(attach).not.toContain("manager_notifications");
    expect(attach).toContain("set overtime_evidence_captured = exists (select 1 from public.overtime_evidence e where e.job_id = j.id)");
    expect(attach).toContain("if not exists (select 1 from public.overtime_evidence e where e.user_id = p_user and e.job_date = p_date)");
  });

  it("lets an employee read only their own proofs and pictures, and change them only while the job is editable", () => {
    expect(sql).toContain("where e.user_id = auth.uid() and e.job_date = p_date");
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(auth\.uid\(\)\)::text/);
    expect(sql.match(/job\.status not in \('saved', 'updated'\) or coalesce\(job\.locked, false\)/g)).toHaveLength(2);
    expect(sql).toContain("p_storage_path not like uid::text || '/' || job.job_date::text || '/%'");
  });

  it("gives employees no delete right on the bucket (a proof cannot be erased behind the managers' back)", () => {
    expect(sql).not.toMatch(/for delete[^;]*overtime-evidence/);
    expect(sql).toContain("revoke all on function public.save_own_overtime_proof(uuid, uuid, uuid, text, integer) from public, anon");
  });
});

// Phase 11 (0145): the database refuses to submit a work order past the line without its own proof.
describe("overtime proof required per work order (0145)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261118180000_0145_overtime_proof_required_per_job.sql", import.meta.url)), "utf8");

  it("checks the proof of THIS job, from the same cut-over date as the app", async () => {
    const { PER_JOB_PROOF_FROM } = await import("./overtime-proof-rules");
    // 0146 moved the cut-over date (2026-11-17 -> 2026-11-16): the app date must match the latest body.
    const latest = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261118200000_0146_overtime_proof_rule_from_nov_16.sql", import.meta.url)), "utf8");
    expect(latest).toContain(`new.job_date >= date '${PER_JOB_PROOF_FROM}'`);
    expect(latest).not.toContain("date '2026-11-17'");
    expect(sql).toContain("before_minutes + duration_minutes - coalesce(unpaid_trip_minutes, 0) > daily_regular_minutes");
    expect(sql).toContain("not exists (select 1 from public.overtime_evidence e where e.job_id = new.id)");
    expect(sql).toContain("message = 'overtime_evidence_required'");
  });

  it("orders the day's jobs like the app (Départ, then id, byte order) and counts only the jobs before this one", () => {
    expect(sql).toContain(`(coalesce(left(j.depart::text, 5), '') collate "C", j.id::text collate "C")`);
    expect(sql).toContain(`< (coalesce(left(new.depart::text, 5), '') collate "C", new.id::text collate "C")`);
  });

  it("keeps the day-level rule for earlier dates, the exemptions, and every other check of the contract", () => {
    expect(sql).toContain("elsif duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > daily_regular_minutes");
    expect(sql).toContain("if not owner_submit and not coalesce(is_office_employee, false) then");
    for (const message of ["invalid_job_interval", "inventory_screenshots_required", "overlapping_job_interval", "return_time_exceeds_job_interval", "invalid_job_kilometres"]) {
      expect(sql).toContain(message);
    }
    expect(sql).toContain("if new.status <> 'submitted' then return new; end if;");
    expect(sql).toContain("daily_regular_minutes := 600;");
  });
});
