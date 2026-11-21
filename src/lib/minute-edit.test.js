import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/evidence-file", () => ({ readPickedFile: async (file) => file, prepareEvidenceImage: async (file) => file }));
const { addProofAsOwner, adjustJobTimes, deleteJobAsOwner, fetchMinuteEditEnabled, minutesBetweenTimes, timesChanged, validateTimesAdjust } = await import("./minute-edit");

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

describe("delete a sheet (migration 0154)", () => {
  it("calls the owner-only RPC with the trimmed reason", async () => {
    const fake = createFakeSupabase({ rpcs: { delete_job_for_employee: null } });
    await deleteJobAsOwner(fake.client, { jobId: "j1", reason: "  doublon  " });
    expect(fake.calls.find((call) => call.rpc === "delete_job_for_employee").args).toEqual({ p_job_id: "j1", p_reason: "doublon" });
  });
  const sql = readFileSync(new URL("../../supabase/migrations/20261121150000_0154_owner_delete_job.sql", import.meta.url), "utf8");
  it("is owner-only, behind the same switch, needs a reason, spares approved / exported sheets and audits before deleting", () => {
    expect(sql).toMatch(/not public\.is_privileged\(\)/);
    expect(sql).toMatch(/minute_edit_disabled/);
    expect(sql).toMatch(/minute_edit_reason_required/);
    expect(sql).toMatch(/status not in \('saved', 'updated', 'submitted'\)/);
    expect(sql).toMatch(/exported_to_sheet/);
    expect(sql.indexOf("job_deleted_by_owner")).toBeLessThan(sql.indexOf("delete from public.jobs"));
    expect(sql).toMatch(/revoke all on function public\.delete_job_for_employee\(uuid, text\) from public, anon/);
  });
});

describe("add the overtime proof (migration 0155)", () => {
  const job = { id: "j1", user_id: "e1", job_date: "2026-11-20" };
  it("uploads into the employee's folder then records it with the reason", async () => {
    const fake = createFakeSupabase({ rpcs: { add_overtime_proof_for_employee: "id" } });
    const id = await addProofAsOwner(fake.client, { job, file: new Blob(["x"]), reason: "  3 min  ", dailyMinutes: 483.4 });
    const upload = fake.calls.find((call) => call.op === "upload");
    expect(upload.path).toBe(`e1/2026-11-20/${id}.jpg`);
    expect(fake.calls.find((call) => call.rpc === "add_overtime_proof_for_employee").args)
      .toEqual({ p_job_id: "j1", p_evidence_id: id, p_storage_path: upload.path, p_daily_minutes: 483, p_reason: "3 min" });
  });
  it("removes the picture again when the record is refused", async () => {
    const fake = createFakeSupabase({ rpcs: { add_overtime_proof_for_employee: () => { throw new Error("x"); } } });
    fake.client.rpc = () => Promise.resolve({ data: null, error: { message: "minute_edit_disabled" } });
    await expect(addProofAsOwner(fake.client, { job, file: new Blob(["x"]), reason: "abc" })).rejects.toBeTruthy();
    expect(fake.calls.some((call) => call.op === "remove")).toBe(true);
  });
  const sql = readFileSync(new URL("../../supabase/migrations/20261121180000_0155_owner_add_overtime_proof.sql", import.meta.url), "utf8");
  it("is owner-only, behind the switch, needs a reason, checks the path and the file, and audits", () => {
    expect(sql).toMatch(/for insert to authenticated\s+with check \(bucket_id = 'overtime-evidence' and public\.is_privileged\(\)\)/);
    expect(sql).toMatch(/not public\.is_privileged\(\)/);
    expect(sql).toMatch(/minute_edit_disabled/);
    expect(sql).toMatch(/minute_edit_reason_required/);
    expect(sql).toMatch(/status not in \('saved', 'updated', 'submitted'\)/);
    expect(sql).toMatch(/invalid_evidence_path/);
    expect(sql).toMatch(/evidence_file_missing/);
    expect(sql).toMatch(/overtime_proof_added_by_owner/);
    expect(sql).toMatch(/revoke all on function public\.add_overtime_proof_for_employee\(uuid, uuid, text, integer, text\) from public, anon/);
  });
});
