import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { isRepeatedCompanyTime, jobEndDate, resolveCompanyWallTime, resolveJobInstants } from "@/lib/company-time";
import { buildCreateJobForEmployeeArgs, repeatedHourFields, validateManagerEntry } from "@/lib/manager-entry";
import { friendlyErrorMessage } from "@/lib/error-messages";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const t = (key) => key;

describe("nuit du changement d'heure — l'heure répétée (0116)", () => {
  it("the 1:00-1:59 of 2026-11-01 happens twice; the choice picks the instant", () => {
    expect(isRepeatedCompanyTime("2026-11-01", "01:30")).toBe(true);
    expect(isRepeatedCompanyTime("2026-11-01", "00:59")).toBe(false);
    expect(isRepeatedCompanyTime("2026-11-01", "02:00")).toBe(false);
    expect(isRepeatedCompanyTime("2026-10-31", "01:30")).toBe(false);
    expect(resolveCompanyWallTime("2026-11-01", "01:30").status).toBe("ambiguous");
    expect(resolveCompanyWallTime("2026-11-01", "01:30", 1).instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(resolveCompanyWallTime("2026-11-01", "01:30", 2).instant.toISOString()).toBe("2026-11-01T06:30:00.000Z");
    // A choice outside the repeated hour changes nothing.
    expect(resolveCompanyWallTime("2026-10-23", "10:00", 2).instant.toISOString()).toBe("2026-10-23T14:00:00.000Z");
    // The spring gap is still refused.
    expect(resolveCompanyWallTime("2026-03-08", "02:30", 1).status).toBe("nonexistent");
  });

  it("a Saturday night job ending in the repeated hour: real length depends on the choice", () => {
    expect(jobEndDate("2026-10-31", "22:00", "01:30")).toBe("2026-11-01");
    const first = resolveJobInstants("2026-10-31", "22:00", "01:30", { finFold: 1 });
    const second = resolveJobInstants("2026-10-31", "22:00", "01:30", { finFold: 2 });
    expect((first.end - first.start) / 3600000).toBe(3.5);
    expect((second.end - second.start) / 3600000).toBe(4.5);
    expect(resolveJobInstants("2026-10-31", "22:00", "01:30").status).toBe("ambiguous");
  });

  it("the emergency timesheet asks only when départ or fin is in the repeated hour", () => {
    const base = { employeeId: "e", jobDate: "2026-10-31", ot: "1", depart: "22:00", fin: "01:30", note: "nuit" };
    const today = "2026-11-02";
    expect(repeatedHourFields(base)).toEqual({ depart: false, fin: true });
    expect(validateManagerEntry(base, today)).toContain("dstChoice");
    expect(validateManagerEntry({ ...base, finFold: 2 }, today)).not.toContain("dstChoice");
    expect(validateManagerEntry({ ...base, fin: "03:00" }, today)).not.toContain("dstChoice");
    expect(buildCreateJobForEmployeeArgs({ ...base, finFold: 2, departFold: 1 }, "k")).toMatchObject({ p_depart_fold: null, p_fin_fold: 2 });
  });

  it("explains the repeated hour and the manager-only choice in plain words", () => {
    expect(friendlyErrorMessage(new Error("invalid_job_contract:invalid_dst_time:ambiguous"), t, "x")).toBe("form.errors.ambiguousTime");
    expect(friendlyErrorMessage(new Error("invalid_job_contract:invalid_dst_time:nonexistent"), t, "x")).toBe("form.errors.nonexistentTime");
    expect(friendlyErrorMessage({ message: "ambiguous_montreal_local_time" }, t, "x")).toBe("form.errors.ambiguousTime");
    expect(friendlyErrorMessage({ message: "dst_choice_manager_only" }, t, "x")).toBe("form.errors.dstChoiceManagerOnly");
  });

  it("the database keeps refusing without a choice and only the definer RPC writes it", () => {
    const sql = read("supabase/migrations/20261025120000_0116_dst_repeated_hour_choice.sql");
    expect(sql).toContain("message = 'ambiguous_montreal_local_time'");
    expect(sql).toContain("message = 'nonexistent_montreal_local_time'");
    expect(sql).toContain("current_user in ('authenticated', 'anon')");
    expect(sql).toContain("message = 'dst_choice_manager_only'");
    expect(sql).toContain("before insert or update of job_date, depart, fin, depart_fold, fin_fold on public.jobs");
    expect(sql).toContain("drop function if exists public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text);");
    expect(sql).toContain("not public.is_privileged()");
  });
});
