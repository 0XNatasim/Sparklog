import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MANAGER_ENTRY_WINDOW_DAYS,
  buildCreateJobForEmployeeArgs,
  isPendingManagerEntry,
  managerEntryDateRange,
  managerEntryState,
  validateManagerEntry,
} from "./manager-entry";
import { friendlyErrorMessage } from "./error-messages";

const migrationSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261009120000_0075_owner_emergency_timesheet.sql",
  import.meta.url
)), "utf8");

const TODAY = "2026-10-09";
const valid = {
  employeeId: "emp-1", jobDate: "2026-10-07", ot: "190403", depart: "08:00", arrivee: "08:30", fin: "16:00", km: "3,2", note: "Phone lost",
};

describe("manager entry date window", () => {
  it("covers today and the previous 31 days", () => {
    expect(MANAGER_ENTRY_WINDOW_DAYS).toBe(31);
    expect(managerEntryDateRange(TODAY)).toEqual({ min: "2026-09-08", max: TODAY });
  });

  it("accepts both boundaries and rejects their neighbours", () => {
    expect(validateManagerEntry({ ...valid, jobDate: "2026-09-08" }, TODAY)).toEqual([]);
    expect(validateManagerEntry({ ...valid, jobDate: TODAY }, TODAY)).toEqual([]);
    expect(validateManagerEntry({ ...valid, jobDate: "2026-09-07" }, TODAY)).toContain("date");
    expect(validateManagerEntry({ ...valid, jobDate: "2026-10-10" }, TODAY)).toContain("date");
  });

  it("matches the database literals", () => {
    expect(migrationSql).toContain("p_job_date > today_local or p_job_date < today_local - 31");
    expect(migrationSql).toContain("timezone('America/Toronto', now())");
  });
});

describe("validateManagerEntry", () => {
  it("accepts a complete entry", () => {
    expect(validateManagerEntry(valid, TODAY)).toEqual([]);
  });

  it("requires the employee, work order, times and a reason", () => {
    const errors = validateManagerEntry({ ...valid, employeeId: "", ot: " ", depart: "", fin: "", note: "ab" }, TODAY);
    expect(errors).toEqual(expect.arrayContaining(["employee", "ot", "depart", "fin", "note"]));
  });

  it("rejects an interval over 16 h or with equal times, accepts an overnight one", () => {
    expect(validateManagerEntry({ ...valid, depart: "06:00", fin: "23:00" }, TODAY)).toContain("interval");
    expect(validateManagerEntry({ ...valid, depart: "08:00", fin: "08:00" }, TODAY)).toContain("interval");
    expect(validateManagerEntry({ ...valid, depart: "20:00", fin: "04:00" }, TODAY)).toEqual([]);
  });

  it("rejects a negative or non-numeric distance", () => {
    expect(validateManagerEntry({ ...valid, km: "-1" }, TODAY)).toContain("km");
    expect(validateManagerEntry({ ...valid, km: "abc" }, TODAY)).toContain("km");
    expect(validateManagerEntry({ ...valid, km: "" }, TODAY)).toEqual([]);
  });
});

describe("buildCreateJobForEmployeeArgs", () => {
  it("never carries ownership, status or lock state", () => {
    const args = buildCreateJobForEmployeeArgs(valid, "key-1");
    expect(args).toEqual({
      p_employee_id: "emp-1", p_submission_key: "key-1", p_job_date: "2026-10-07", p_ot: "190403",
      p_depart: "08:00", p_arrivee: "08:30", p_fin: "16:00", p_km_aller: 3.2, p_note: "Phone lost",
    });
  });
});

describe("pending manager entries", () => {
  const base = { manager_entry_at: "2026-10-08T12:00:00Z", employee_confirmed_at: null, status: "saved", locked: false };

  it("is pending until the employee confirms", () => {
    expect(isPendingManagerEntry(base)).toBe(true);
    expect(isPendingManagerEntry({ ...base, status: "updated" })).toBe(true);
    expect(isPendingManagerEntry({ ...base, employee_confirmed_at: "2026-10-08T13:00:00Z" })).toBe(false);
    expect(isPendingManagerEntry({ ...base, status: "submitted", locked: true })).toBe(false);
    expect(isPendingManagerEntry({ status: "saved", locked: false })).toBe(false);
    expect(isPendingManagerEntry(undefined)).toBe(false);
  });

  it("reports the workflow state", () => {
    expect(managerEntryState(base)).toBe("pending");
    expect(managerEntryState({ ...base, status: "submitted" })).toBe("submitted");
    expect(managerEntryState({ ...base, status: "approved" })).toBe("approved");
    expect(managerEntryState({ status: "saved" })).toBeNull();
  });

  it("translates the database confirmation error", () => {
    const t = (key) => key;
    expect(friendlyErrorMessage(new Error("manager_entry_confirmation_required"), t, "x")).toBe("history.errors.managerEntryConfirm");
  });
});

describe("migration 0075 database contract", () => {
  it("creates the entry only for an owner, as a draft, never submitted", () => {
    expect(migrationSql).toContain("not public.is_privileged()");
    expect(migrationSql).toContain("owner_role_required");
    expect(migrationSql).toMatch(/'saved', false,\s+now\(\), actor_id/);
    expect(migrationSql).toContain("target.role not in ('employee', 'admin', 'subcontractor_1')");
    expect(migrationSql).toContain("or target.is_paused");
  });

  it("is idempotent per employee under the shared advisory lock", () => {
    expect(migrationSql).toContain("pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0))");
    expect(migrationSql).toContain("j.user_id = p_employee_id and j.submission_key = p_submission_key");
  });

  it("opens the work day so the employee can still submit after the deadline", () => {
    expect(migrationSql).toContain("insert into public.job_entry_unlocks");
    expect(migrationSql).toContain("on conflict (user_id, job_date) do update");
  });

  it("audits creation, reminders and confirmation", () => {
    for (const action of ["job_created_by_owner", "manager_entry_reminded", "manager_entry_confirmed"]) {
      expect(migrationSql).toContain(`'${action}'`);
    }
  });

  it("makes save_own_job refuse an unconfirmed submit and stamps the confirmation atomically", () => {
    expect(migrationSql).toContain("manager_entry_confirmation_required");
    expect(migrationSql).toContain("p_confirm_manager_entry boolean default false");
    expect(migrationSql).toContain("employee_confirmed_at = case when confirming then now()");
    // The previous 15-argument overload is dropped so a call cannot be ambiguous.
    expect(migrationSql).toContain("drop function if exists public.save_own_job(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, boolean);");
  });

  it("protects the manager-entry columns from direct API writes", () => {
    expect(migrationSql).toContain("current_user in ('authenticated', 'anon')");
    expect(migrationSql).toContain("manager_entry_fields_protected");
    expect(migrationSql).toMatch(/create trigger jobs_protect_manager_entry_fields\s+before insert or update on public\.jobs/);
    // A SECURITY DEFINER trigger would make current_user the owner and defeat the check.
    const triggerFn = migrationSql.slice(
      migrationSql.indexOf("function public.protect_job_manager_entry_fields"),
      migrationSql.indexOf("drop trigger if exists jobs_protect_manager_entry_fields")
    );
    expect(triggerFn).not.toContain("security definer");
  });

  it("limits reminders to one per hour and exposes the RPCs only to signed-in users", () => {
    expect(migrationSql).toContain("interval '1 hour'");
    expect(migrationSql).toContain("reminder_too_soon");
    for (const signature of [
      "create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text)",
      "remind_manager_entry(uuid)",
    ]) {
      expect(migrationSql).toContain(`revoke all on function public.${signature}`);
      expect(migrationSql).toContain(`grant execute on function public.${signature}`);
    }
  });
});

describe("migration 0078 delete_manager_entry", () => {
  const deleteSql = readFileSync(fileURLToPath(new URL(
    "../../supabase/migrations/20261009180000_0078_delete_manager_entry.sql", import.meta.url
  )), "utf8");

  it("is owner-only, locks the row and refuses anything already validated", () => {
    expect(deleteSql).toContain("not public.is_privileged()");
    expect(deleteSql).toContain("owner_role_required");
    expect(deleteSql).toContain("for update");
    expect(deleteSql).toContain("current_job.manager_entry_at is null");
    expect(deleteSql).toContain("current_job.employee_confirmed_at is not null");
    expect(deleteSql).toContain("job_state_changed");
  });

  it("audits the deletion and is exposed only to signed-in users", () => {
    expect(deleteSql).toContain("'manager_entry_deleted'");
    expect(deleteSql).toContain("revoke all on function public.delete_manager_entry(uuid) from public, anon");
    expect(deleteSql).toContain("grant execute on function public.delete_manager_entry(uuid) to authenticated");
  });
});
