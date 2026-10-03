import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APPLICATION_ROLES, authorizationFor } from "./authorization-matrix";
import { GRANTABLE_ADMIN_SECTIONS } from "./roles";

const migration = (name) => readFileSync(fileURLToPath(new URL(
  `../../supabase/migrations/${name}`,
  import.meta.url
)), "utf8");

const roleMigration = migration("20260923004309_subcontractor_1_role.sql");
const submissionMigration = migration("20260927025008_0060_atomic_idempotent_job_submission.sql");
const transitionMigration = migration("20260927025045_0061_manager_state_transition_rpcs.sql");
const timezoneMigration = migration("20260927025233_0063_montreal_timezone_and_dst.sql");
const privilegeMigration = migration("20260910220157_0032_owner_role_replaces_hardcoded_privileged.sql");

describe("application authorization matrix", () => {
  it("covers every persisted application role", () => {
    expect(APPLICATION_ROLES).toEqual([
      "employee", "subcontractor_1", "admin", "manager", "owner",
    ]);
  });

  it.each(["employee", "subcontractor_1"])("keeps %s on own-time only", (role) => {
    const permissions = authorizationFor({ role });
    expect(permissions.canLogOwnTime).toBe(true);
    expect(permissions.canManageAny).toBe(false);
    expect(permissions.canAccessSensitiveNas).toBe(false);
  });

  it("gives an admin exactly the selected management sections", () => {
    for (const granted of GRANTABLE_ADMIN_SECTIONS) {
      const permissions = authorizationFor({ role: "admin", adminSections: [granted] });
      expect(permissions.canManageAny).toBe(true);
      for (const section of GRANTABLE_ADMIN_SECTIONS) {
        expect(permissions.managementSections[section], `${granted} -> ${section}`).toBe(section === granted);
      }
      expect(permissions.canAccessSensitiveNas).toBe(false);
      expect(permissions.includedInCcqPayroll).toBe(false);
    }
  });

  it.each(["manager", "owner"])("gives %s every management section", (role) => {
    const permissions = authorizationFor({ role });
    expect(Object.values(permissions.managementSections).every(Boolean)).toBe(true);
  });

  it("keeps payroll, reports, settings and audit pages manager-only", () => {
    const managerOnly = ["payroll-calcul", "payroll-stubs", "payroll-das", "payroll-roe", "reports-costs",
      "reports-period", "reports-ccq", "reports-downloads", "config-settings", "advanced-audit", "advanced-health", "absences"];
    for (const role of APPLICATION_ROLES) {
      const pages = authorizationFor({ role, adminSections: [...GRANTABLE_ADMIN_SECTIONS] }).pages;
      for (const id of managerOnly) {
        expect(pages[id], `${role}:${id}`).toBe(role === "manager" || role === "owner");
      }
    }
  });

  it("reserves sensitive NAS access for the owner", () => {
    for (const role of APPLICATION_ROLES) {
      expect(authorizationFor({ role }).canAccessSensitiveNas, role).toBe(role === "owner");
    }
  });

  it("contains own writes for every paused persona", () => {
    for (const role of APPLICATION_ROLES) {
      expect(authorizationFor({ role, paused: true }).canLogOwnTime, role).toBe(false);
    }
  });

  it("keeps employee and manager CCQ treatment separate from non-CCQ roles", () => {
    expect(authorizationFor({ role: "employee" }).includedInCcqPayroll).toBe(true);
    expect(authorizationFor({ role: "manager" }).includedInCcqPayroll).toBe(true);
    for (const role of ["admin", "owner", "subcontractor_1"]) {
      expect(authorizationFor({ role }).includedInCcqPayroll, role).toBe(false);
    }
  });
});

describe("database authorization contract", () => {
  it("maps owner to manager and subcontractor to employee tier", () => {
    expect(roleMigration).toMatch(/role = 'owner' then 'manager'/);
    expect(roleMigration).toMatch(/role in \('admin', 'subcontractor_1'\) then 'employee'/);
  });

  it("requires active ownership for direct job drafts", () => {
    expect(submissionMigration).toContain("public.is_not_paused()");
    expect(submissionMigration).toContain("user_id = auth.uid()");
    expect(submissionMigration).toContain("status = 'saved'");
  });

  it("resolves a retried submission key before the validator can see it as an overlap", () => {
    const lookup = submissionMigration.indexOf("where j.user_id = caller_id and j.submission_key = p_submission_key");
    const insert = submissionMigration.indexOf("insert into public.jobs");
    expect(lookup).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(insert);
    expect(submissionMigration).toContain("pg_advisory_xact_lock(hashtextextended(caller_id::text, 0))");
    expect(timezoneMigration).toContain("pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0))");
    expect(submissionMigration).toContain("jobs_user_submission_key_uniq");
    expect(submissionMigration).not.toContain("create unique index");
  });

  it("removes broad manager writes and role-checks every transition RPC", () => {
    expect(transitionMigration).toContain('drop policy if exists "jobs: manager update all"');
    expect(transitionMigration).toContain('drop policy if exists "jobs: manager insert"');
    expect(transitionMigration.match(/public\.get_my_role\(\) <> 'manager'/g)).toHaveLength(3);
  });

  it("keeps database privilege owner-only", () => {
    expect(privilegeMigration).toMatch(/role = 'owner'/);
    expect(privilegeMigration).not.toMatch(/role in \('manager', 'owner'\)/);
  });
});

