import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { otReuseAnomalies, otReuseOthersText, sortAnomalies } from "./job-anomalies";

const A = "user-a";
const B = "user-b";
const jobs = [
  { id: "j1", user_id: A, job_date: "2026-10-19", status: "submitted", ot: " 200451 ", depart: "07:00:00", fin: "07:24:00" },
  { id: "j2", user_id: A, job_date: "2026-10-19", status: "submitted", ot: "189016", depart: "09:00:00", fin: "10:15:00" },
  { id: "j3", user_id: A, job_date: "2026-10-20", status: "approved", ot: "191379", depart: "08:00:00", fin: "09:00:00" },
];
const rows = [
  { job_id: "j1", other_job_id: "x1", other_user_id: B, other_name: "Patrick Grandbois", other_date: "2026-10-14", other_depart: "08:47:00", other_fin: "09:10:00", other_status: "submitted" },
  { job_id: "j1", other_job_id: "x2", other_user_id: A, other_name: "Patrick Donais", other_date: "2026-10-02", other_depart: "10:00:00", other_fin: "11:00:00", other_status: "approved" },
  // Exact same entry (same employee, day and times): left to the « duplicate » anomaly.
  { job_id: "j2", other_job_id: "x3", other_user_id: A, other_name: "Patrick Donais", other_date: "2026-10-19", other_depart: "09:00:00", other_fin: "10:15:00", other_status: "submitted" },
  // A job that is not submitted any more is not flagged.
  { job_id: "j3", other_job_id: "x4", other_user_id: B, other_name: "Tianyi Zhang", other_date: "2026-10-16", other_depart: "09:52:00", other_fin: "12:45:00", other_status: "submitted" },
  // Unknown job id (not on screen) is ignored.
  { job_id: "zz", other_job_id: "x5", other_user_id: B, other_name: "?", other_date: "2026-10-16", other_depart: null, other_fin: null, other_status: "saved" },
];

describe("« OT déjà utilisé » anomaly (0108)", () => {
  it("flags each submitted job once, with every other job carrying its OT", () => {
    const anomalies = otReuseAnomalies(rows, jobs);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ key: "ot_reused:j1", type: "ot_reused", userId: A, jobDate: "2026-10-19", jobIds: ["j1"], ot: "200451" });
    expect(anomalies[0].others).toEqual([
      { jobId: "x1", userId: B, name: "Patrick Grandbois", date: "2026-10-14", status: "submitted" },
      { jobId: "x2", userId: A, name: "Patrick Donais", date: "2026-10-02", status: "approved" },
    ]);
  });

  it("keeps a reuse by the same employee on the same day when the times differ (OT split in two)", () => {
    const split = [{ ...rows[2], other_depart: "07:00:00", other_fin: "07:30:00" }];
    expect(otReuseAnomalies(split, jobs).map((a) => a.key)).toEqual(["ot_reused:j2"]);
  });

  it("writes the other jobs as name · date (status), at most three then +N", () => {
    const t = (key) => ({ "status.submitted": "soumis", "status.approved": "approuvé" })[key] || key;
    const formatDate = (d) => d.slice(5);
    const others = otReuseAnomalies(rows, jobs)[0].others;
    expect(otReuseOthersText(others, { t, formatDate })).toBe("Patrick Grandbois · 10-14 (soumis) ; Patrick Donais · 10-02 (approuvé)");
    const many = [...others, ...others];
    expect(otReuseOthersText(many, { t, formatDate })).toMatch(/ ; \+1$/);
  });

  it("sorts merged anomalies newest day first", () => {
    const merged = sortAnomalies([{ jobDate: "2026-10-14", userId: "b" }, { jobDate: "2026-10-19", userId: "a" }]);
    expect(merged.map((a) => a.jobDate)).toEqual(["2026-10-19", "2026-10-14"]);
  });
});

describe("migration 0108 and its callers", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261021220000_0108_ot_reuse_check.sql", import.meta.url), "utf8");
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

  it("only counts real OT numbers and only answers managers", () => {
    expect(sql).toContain("btrim(coalesce(p_ot, '')) ~ '^[0-9]{4,}$'");
    expect(sql).toMatch(/where public\.get_my_role\(\) = 'manager'/);
    expect(sql).toMatch(/revoke all on function public\.ot_reuse_for_jobs\(uuid\[\]\) from public, anon/);
    // The index calls normalized_ot on every write to jobs, service role included: never revoke it.
    expect(sql).not.toMatch(/revoke [^;]*normalized_ot/);
  });

  it("is merged into the anomalies of À traiter and Feuilles de temps", () => {
    for (const file of ["../components/manager/TodoInbox.jsx", "../pages/ManagerDashboard.jsx"]) {
      const src = read(file);
      expect(src).toContain("loadOtReuse(");
      expect(src).toContain("otReuseAnomalies(");
      expect(src).toContain("others: otReuseOthersText(");
    }
  });
});
