import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const { adjustJobTimes, fetchMinuteEditEnabled, minutesBetweenTimes, timesChanged, validateTimesAdjust } = await import("./minute-edit");

describe("minute-edit", () => {
  it("counts the minutes between two times, a Fin before the Départ being the next day", () => {
    expect(minutesBetweenTimes("06:57", "15:00")).toBe(483);
    expect(minutesBetweenTimes("07:00", "15:00")).toBe(480);
    expect(minutesBetweenTimes("22:00", "02:00")).toBe(240);
    expect(minutesBetweenTimes("", "15:00")).toBeNull();
  });

  it("asks for valid times and a written reason", () => {
    expect(validateTimesAdjust({ depart: "07:00", fin: "15:00", reason: "3 minutes de temps supp." })).toEqual([]);
    expect(validateTimesAdjust({ depart: "07:00", fin: "15:00", reason: "ab" })).toEqual(["reason"]);
    expect(validateTimesAdjust({ depart: "", fin: "15:00", reason: "raison" })).toContain("depart");
    // 17 h of work: past the 16 h the database accepts
    expect(validateTimesAdjust({ depart: "05:00", fin: "22:00", reason: "raison" })).toEqual(["interval"]);
  });

  it("sees whether anything changed", () => {
    expect(timesChanged({ depart: "06:57:00", fin: "15:00:00" }, "06:57", "15:00")).toBe(false);
    expect(timesChanged({ depart: "06:57:00", fin: "15:00:00" }, "07:00", "15:00")).toBe(true);
  });

  it("calls the owner-only RPC with the trimmed reason and HH:mm times", async () => {
    const fake = createFakeSupabase({ rpcs: { adjust_job_times_for_employee: { id: "j1" } } });
    await adjustJobTimes(fake.client, { jobId: "j1", depart: "07:00:00", fin: "15:00", reason: "  ajustement  " });
    const call = fake.calls.find((entry) => entry.rpc === "adjust_job_times_for_employee");
    expect(call.args).toEqual({ p_job_id: "j1", p_depart: "07:00", p_fin: "15:00", p_reason: "ajustement" });
  });

  it("reads the switch, a missing column meaning off", async () => {
    const on = createFakeSupabase({ tables: { overtime_settings: [{ id: true, minute_edit_enabled: true }] } });
    const missing = createFakeSupabase({ tables: { overtime_settings: [{ id: true }] } });
    expect(await fetchMinuteEditEnabled(on.client)).toBe(true);
    expect(await fetchMinuteEditEnabled(missing.client)).toBe(false);
  });
});

describe("migration 0152 (source lock)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261120180000_0152_owner_adjust_job_minutes.sql", import.meta.url), "utf8");
  it("is owner-only, behind the switch, audited and never touches approved sheets", () => {
    expect(sql).toMatch(/minute_edit_enabled boolean not null default false/);
    expect((sql.match(/not public\.is_privileged\(\)/g) || []).length).toBe(2);
    expect(sql).toMatch(/minute_edit_disabled/);
    expect(sql).toMatch(/status not in \('saved', 'updated', 'submitted'\)/);
    expect(sql).toMatch(/exported_to_sheet/);
    expect(sql).toMatch(/job_times_adjusted_by_owner/);
    expect(sql).toMatch(/minute_edit_reason_required/);
    expect(sql).toMatch(/overlapping_job_interval/);
    expect(sql).toMatch(/revoke all on function public\.adjust_job_times_for_employee\(uuid, time, time, text\) from public, anon/);
  });
});
