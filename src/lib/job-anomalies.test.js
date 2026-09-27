import { describe, expect, it } from "vitest";
import { ANOMALY_LIMITS, anomaliesForJobs, anomalyLimitsFromSettings, detectJobAnomalies } from "./job-anomalies";

const job = (id, depart, fin, extra = {}) => ({
  id, user_id: "u1", job_date: "2026-09-24", status: "submitted", ot: "OT-1", depart, fin, km_total: 20, ...extra,
});
const types = (anomalies) => anomalies.map((anomaly) => anomaly.type);

describe("detectJobAnomalies", () => {
  it("reports a duplicate entry once, not also as an overlap", () => {
    const anomalies = detectJobAnomalies([job("a", "08:00", "12:00"), job("b", "08:00", "12:00", { ot: " ot-1 " })]);
    expect(types(anomalies)).toEqual(["duplicate"]);
    expect(anomalies[0].jobIds).toEqual(["a", "b"]);
  });

  it("measures overlap on resolved instants and lists the submitted job first", () => {
    const anomalies = detectJobAnomalies([
      job("approved", "08:00", "12:00", { status: "approved", started_at: "2026-09-24T12:00:00Z", ended_at: "2026-09-24T16:00:00Z" }),
      job("late", "11:30", "15:00", { ot: "OT-2", started_at: "2026-09-24T15:30:00Z", ended_at: "2026-09-24T19:00:00Z" }),
    ]);
    expect(anomalies).toEqual([expect.objectContaining({ type: "overlap", minutes: 30, jobIds: ["late", "approved"] })]);
  });

  it("accepts back-to-back jobs and ignores drafts", () => {
    expect(detectJobAnomalies([
      job("a", "08:00", "12:00"),
      job("b", "12:00", "16:00", { ot: "OT-2" }),
      job("draft", "09:00", "10:00", { ot: "OT-3", status: "saved" }),
    ])).toEqual([]);
  });

  it("flags overtime without evidence, a long day and high kilometres", () => {
    const anomalies = detectJobAnomalies([
      job("a", "05:00", "12:00"),
      job("b", "12:00", "18:30", { ot: "OT-2", km_total: 320 }),
    ]);
    expect(types(anomalies).sort()).toEqual(["high_km", "long_day", "overtime_no_evidence"]);
    expect(anomalies.find((anomaly) => anomaly.type === "long_day").minutes).toBe(13.5 * 60);
    expect(anomalies.find((anomaly) => anomaly.type === "high_km")).toMatchObject({ km: 320, jobIds: ["b"] });
  });

  it("does not flag overtime when any job of the day carries the evidence", () => {
    expect(detectJobAnomalies([
      job("a", "07:00", "12:00", { overtime_evidence_captured: true }),
      job("b", "12:00", "16:30", { ot: "OT-2" }),
    ])).toEqual([]);
  });

  it("skips anomalies where every job is already approved", () => {
    expect(detectJobAnomalies([
      job("a", "08:00", "12:00", { status: "approved" }),
      job("b", "08:00", "12:00", { status: "approved" }),
    ])).toEqual([]);
  });

  it("keeps employees and dates apart", () => {
    expect(detectJobAnomalies([
      job("a", "08:00", "12:00"),
      job("b", "08:00", "12:00", { user_id: "u2" }),
      job("c", "08:00", "12:00", { job_date: "2026-09-25" }),
    ])).toEqual([]);
  });
});

describe("configurable limits", () => {
  it("uses the manager's thresholds and falls back to the defaults", () => {
    const jobs = [job("a", "07:00", "17:30", { km_total: 250, overtime_evidence_captured: true })];
    expect(detectJobAnomalies(jobs)).toEqual([]);
    const strict = anomalyLimitsFromSettings({ anomaly_long_day_minutes: 600, anomaly_high_km: 200 });
    expect(types(detectJobAnomalies(jobs, strict)).sort()).toEqual(["high_km", "long_day"]);
    expect(anomalyLimitsFromSettings({})).toEqual(ANOMALY_LIMITS);
    expect(anomalyLimitsFromSettings({ anomaly_long_day_minutes: 0, anomaly_high_km: "abc" })).toEqual(ANOMALY_LIMITS);
  });
});

describe("anomaliesForJobs", () => {
  it("keeps the anomalies touching a batch", () => {
    const anomalies = detectJobAnomalies([job("a", "08:00", "12:00"), job("b", "08:00", "12:00")]);
    expect(anomaliesForJobs(anomalies, ["b"])).toHaveLength(1);
    expect(anomaliesForJobs(anomalies, ["z"])).toHaveLength(0);
  });
});
