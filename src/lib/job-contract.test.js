import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_JOB_DURATION_MINUTES,
  RETURN_TIME_MINUTES,
  RETURN_TIME_OPTIONS,
  isValidReturnMinutes,
  jobDurationMinutes,
  validateJobSubmissionContract,
} from "./job-contract";

const migrationPath = fileURLToPath(new URL(
  "../../supabase/migrations/20260927025132_0062_job_write_contract.sql",
  import.meta.url
));
const migrationSql = readFileSync(migrationPath, "utf8");

describe("job UI/database contract", () => {
  it("keeps every UI return-time option valid in the shared contract", () => {
    expect(RETURN_TIME_OPTIONS.every(isValidReturnMinutes)).toBe(true);
  });

  it("accepts every 5-minute database boundary from 0 through 240", () => {
    for (let minutes = 0; minutes <= 240; minutes += 5) {
      expect(isValidReturnMinutes(minutes), String(minutes)).toBe(true);
    }
  });

  it.each([-5, 1, 4, 241, 245, 10.5, null, undefined])(
    "rejects an unsupported return duration: %s",
    (minutes) => expect(isValidReturnMinutes(minutes)).toBe(false)
  );

  it("matches overnight and maximum-duration semantics", () => {
    expect(jobDurationMinutes("22:00", "06:00")).toBe(480);
    expect(jobDurationMinutes("08:00", "00:00")).toBe(MAX_JOB_DURATION_MINUTES);
    expect(validateJobSubmissionContract({
      depart: "08:00", fin: "00:01", return_time_minutes: 0,
      km_total: 0, km_aller: 0, km_retour: 0,
    })).toContain("invalid_interval");
  });

  it("rejects return time outside the interval and inconsistent kilometres", () => {
    expect(validateJobSubmissionContract({
      depart: "08:00", fin: "09:00", return_time_minutes: 65,
      km_total: 20, km_aller: 15, km_retour: 10,
    })).toEqual(expect.arrayContaining(["return_exceeds_interval", "invalid_kilometres"]));
  });

  it("rejects Montréal DST gaps and folds before submission", () => {
    const base = { return_time_minutes: 0, km_total: 0, km_aller: 0, km_retour: 0 };
    expect(validateJobSubmissionContract({
      ...base, job_date: "2026-03-08", depart: "02:30", fin: "03:30",
    })).toContain("invalid_dst_time");
    expect(validateJobSubmissionContract({
      ...base, job_date: "2026-11-01", depart: "01:30", fin: "02:30",
    })).toContain("invalid_dst_time");
  });

  it("locks the migration literals to the UI contract", () => {
    expect(migrationSql).toContain(`return_time_minutes >= ${RETURN_TIME_MINUTES.min}`);
    expect(migrationSql).toContain(`return_time_minutes <= ${RETURN_TIME_MINUTES.max}`);
    expect(migrationSql).toContain(`return_time_minutes % ${RETURN_TIME_MINUTES.step}`);
    expect(migrationSql).toContain(`duration_minutes > ${MAX_JOB_DURATION_MINUTES}`);
    expect(migrationSql).toContain("return_time_exceeds_job_interval");
    expect(migrationSql).toContain("invalid_job_kilometres");
  });
});
