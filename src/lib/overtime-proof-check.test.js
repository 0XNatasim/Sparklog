import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expectedProof, otDigits, proofAnomalies, proofDetailsText, proofDifferences } from "./overtime-proof-check";

// Friday 2026-11-06 of the support case: 3 h 13 + 1 h 37 + 4 h 50 = 580 min, 60 min of return on the last job.
const day = [
  { id: "j1", user_id: "u1", job_date: "2026-11-06", status: "submitted", ot: "208637", depart: "07:07", arrivee: "07:19", fin: "10:20", km_total: 4, return_time_minutes: 0 },
  { id: "j2", user_id: "u1", job_date: "2026-11-06", status: "submitted", ot: "265505", depart: "10:21", arrivee: "10:29", fin: "11:58", km_total: 4, return_time_minutes: 0 },
  { id: "j3", user_id: "u1", job_date: "2026-11-06", status: "submitted", ot: "209210", depart: "11:58", arrivee: "12:32", fin: "16:48", km_total: 177, return_time_minutes: 60 },
];
const row = (fields) => ({ job_id: "j3", ocr_status: "processed", proof_read_at: "2026-11-06T21:51:20Z", proof_ot: null, proof_client_minutes: null, proof_return_minutes: null, ...fields });
const t = (key, params) => `${key}|${JSON.stringify(params)}`;

describe("what the overtime request form must say", () => {
  it("is the last OT of the day, the minutes beyond 8 h without the return, and the return", () => {
    expect(expectedProof(day)).toEqual({ ot: "209210", clientMinutes: 40, returnMinutes: 60 });
  });

  it("starts the overtime after 10 h on « 4 jours de 10 h » and leaves out the unpaid first trip", () => {
    expect(expectedProof(day, { tenHourDay: true }).clientMinutes).toBe(0);
    expect(expectedProof(day, { firstTripUnpaid: true }).clientMinutes).toBe(40 - 12); // first trip 07:07–07:19
  });

  it("compares only the OT of a numbered work order", () => {
    expect(otDigits("OT-209210")).toBe("209210");
    expect(otDigits("FORMATION HQ")).toBeNull();
    expect(expectedProof([{ ...day[2], ot: "FORMATION HQ" }]).ot).toBeNull();
  });

  it("accepts the quarter-hour rounding but not a real difference", () => {
    const expected = { ot: "209210", clientMinutes: 40, returnMinutes: 60 };
    expect(proofDifferences({ ot: "209210", clientMinutes: 45, returnMinutes: 60 }, expected)).toEqual([]);
    expect(proofDifferences({ ot: "209210", clientMinutes: 60, returnMinutes: 60 }, expected)).toEqual([{ field: "client", found: 60, expected: 40 }]);
    expect(proofDifferences({ ot: "208637", clientMinutes: 40, returnMinutes: 0 }, expected).map((d) => d.field)).toEqual(["ot", "return"]);
    expect(proofDifferences({ ot: null, clientMinutes: null, returnMinutes: 60 }, expected)).toEqual([]);
  });
});

describe("alerts for the manager", () => {
  it("is silent when the form matches the day", () => {
    expect(proofAnomalies([row({ proof_ot: "209210", proof_client_minutes: 45, proof_return_minutes: 60 })], day)).toEqual([]);
  });

  it("flags a form that does not match, with what was found and what was expected", () => {
    const [alert] = proofAnomalies([row({ proof_ot: "208637", proof_client_minutes: 40, proof_return_minutes: 60 })], day);
    expect(alert).toMatchObject({ type: "proof_mismatch", key: "proof_mismatch:j3", userId: "u1", jobDate: "2026-11-06", jobIds: ["j3"] });
    expect(proofDetailsText(alert, t)).toBe('manager.anomalies.proofField.ot|{"found":"208637","expected":"209210"}');
  });

  it("flags a picture the reader could not read, but never an older SMS proof", () => {
    expect(proofAnomalies([row({ ocr_status: "failed" })], day)[0]).toMatchObject({ type: "proof_unread" });
    expect(proofAnomalies([row({ proof_read_at: null })], day)).toEqual([]);
  });

  it("flags only a job still waiting for approval", () => {
    const approved = day.map((job) => ({ ...job, status: "approved" }));
    expect(proofAnomalies([row({ proof_ot: "1", proof_client_minutes: 600 })], approved)).toEqual([]);
  });
});

describe("migration 0141", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261116120000_0141_overtime_proof_form_fields.sql", import.meta.url), "utf8");
  it("adds the four columns and drops whatever an employee inserts in them", () => {
    for (const column of ["proof_ot", "proof_client_minutes", "proof_return_minutes", "proof_read_at"]) {
      expect(sql).toContain(`add column if not exists ${column}`);
      expect(sql).toContain(`new.${column} := null`);
    }
    expect(sql).toMatch(/before insert\s+on public\.overtime_evidence/);
  });
});

describe("proofAnomalies › wrong screenshot", () => {
  it("flags a submitted job whose proof is not the overtime form, whatever the numbers", () => {
    const jobs = [{ id: "j1", user_id: "u1", job_date: "2026-11-18", status: "submitted", ot: "198909", depart: "08:00", fin: "17:00", return_time_minutes: 0 }];
    const rows = [{ id: "e1", job_id: "j1", ocr_status: "wrong_document", proof_read_at: "2026-11-18T20:00:00Z", proof_ot: null, proof_client_minutes: null, proof_return_minutes: null }];
    expect(proofAnomalies(rows, jobs)).toEqual([expect.objectContaining({ type: "proof_wrong", jobIds: ["j1"], userId: "u1" })]);
    expect(proofAnomalies(rows, jobs.map((job) => ({ ...job, status: "approved" })))).toEqual([]);
  });
});

describe("proofAnomalies › SMS proof", () => {
  it("accepts the screenshot of the approval text message: no unread alert, no mismatch", () => {
    const jobs = [{ id: "j1", user_id: "u1", job_date: "2026-11-20", status: "submitted", ot: "231731", depart: "08:00", fin: "17:00", return_time_minutes: 0 }];
    const rows = [{ id: "e1", job_id: "j1", ocr_status: "sms", proof_read_at: "2026-11-20T20:00:00Z", proof_ot: null, proof_client_minutes: null, proof_return_minutes: null }];
    expect(proofAnomalies(rows, jobs)).toEqual([]);
  });
});
