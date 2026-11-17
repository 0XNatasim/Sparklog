import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { overtimeProofsRequired } from "./overtime-evidence-check";

const job = (id, depart, minutes) => ({ id, depart, minutes });
const required = (jobs, options = {}) => overtimeProofsRequired(jobs, { minutesOf: (j) => j.minutes, ...options });

describe("overtimeProofsRequired — one screenshot per work order past the 8 h line", () => {
  it("is 0 for a day at or under 8 h", () => {
    expect(required([job("a", "06:00", 480)])).toBe(0);
    expect(required([job("a", "06:00", 300), job("b", "11:00", 180)])).toBe(0);
  });

  it("counts the job that crosses the line and every job after it", () => {
    expect(required([job("a", "06:00", 360), job("b", "12:00", 180)])).toBe(1);          // 6 h + 3 h: b crosses
    expect(required([job("a", "06:00", 360), job("b", "12:00", 180), job("c", "15:00", 60)])).toBe(2); // c is past the line too
  });

  it("uses the order of the Départ, not the order the jobs were entered", () => {
    const entered = [job("c", "15:00", 60), job("a", "06:00", 360), job("b", "12:00", 180)];
    expect(required(entered)).toBe(2);
    // The earliest job entered last can push a later job past the line.
    expect(required([job("b", "12:00", 300), job("a", "06:00", 300)])).toBe(1);
  });

  it("takes the first unpaid trip off the day's first job", () => {
    const jobs = [job("a", "06:00", 480), job("b", "14:00", 30)];
    expect(required(jobs)).toBe(1);
    expect(required(jobs, { unpaidTripMinutes: 45 })).toBe(0); // 435 + 30 = 465 ≤ 480
  });

  it("uses 10 h with « 4 jours de 10 h »", () => {
    const jobs = [job("a", "06:00", 540), job("b", "15:00", 120)];
    expect(required(jobs, { thresholdMinutes: 600 })).toBe(1);
    expect(required([job("a", "06:00", 540), job("b", "15:00", 60)], { thresholdMinutes: 600 })).toBe(0);
  });
});

import { overtimeLineJobIds, proofPerJob, PER_JOB_PROOF_FROM } from "./overtime-proof-rules";
import { overtimeMarkerJobIds } from "./timesheet-layout";
import { dailyOvertimeEvidenceRequirement } from "./job-submission";

describe("per work order, from the cut-over date", () => {
  it("applies from 2026-11-18; earlier days keep the day-level rule", () => {
    expect(PER_JOB_PROOF_FROM).toBe("2026-11-18");
    expect(proofPerJob("2026-11-17")).toBe(false);
    expect(proofPerJob("2026-11-18")).toBe(true);
  });

  it("names the jobs past the line, in time order", () => {
    const ids = overtimeLineJobIds([job("c", "15:00", 60), job("a", "06:00", 360), job("b", "12:00", 180)], { minutesOf: (j) => j.minutes });
    expect([...ids].sort()).toEqual(["b", "c"]);
  });

  it("puts the clock on each job that carries its own proof (from the cut-over), and on the day's last job before it", () => {
    const jobs = [
      { id: "n1", job_date: "2026-11-18", fin: "12:00", overtime_evidence_captured: true },
      { id: "n2", job_date: "2026-11-18", fin: "17:00", overtime_evidence_captured: true },
      { id: "n3", job_date: "2026-11-18", fin: "18:00", overtime_evidence_captured: false },
      { id: "o1", job_date: "2026-11-10", fin: "12:00", overtime_evidence_captured: false },
      { id: "o2", job_date: "2026-11-10", fin: "17:00", overtime_evidence_captured: true },
    ];
    expect([...overtimeMarkerJobIds(jobs)].sort()).toEqual(["n1", "n2", "o2"]);
  });

  it("History: a job past the line needs its own proof, even when another job of the day has one", () => {
    const a = { id: "a", job_date: "2026-11-18", depart: "06:00", fin: "12:00", status: "saved", overtime_evidence_captured: false };
    const b = { id: "b", job_date: "2026-11-18", depart: "12:00", fin: "15:00", status: "saved", overtime_evidence_captured: true };
    const c = { id: "c", job_date: "2026-11-18", depart: "15:00", fin: "16:00", status: "saved", overtime_evidence_captured: false };
    const jobs = [a, b, c];
    expect(dailyOvertimeEvidenceRequirement(c, jobs).required).toBe(true);   // c is past the line, no proof of its own
    expect(dailyOvertimeEvidenceRequirement(b, jobs).required).toBe(false);  // b has its own
    expect(dailyOvertimeEvidenceRequirement(a, jobs).required).toBe(false);  // a is under the line
    // Before the cut-over: one proof per day.
    const old = jobs.map((job) => ({ ...job, job_date: "2026-11-17" }));
    expect(dailyOvertimeEvidenceRequirement(old[2], old).required).toBe(false);
  });
});

import { overtimeEvidenceNeeded } from "./overtime-evidence-check";
import { createFakeSupabase } from "@/test/fake-supabase";

describe("overtimeEvidenceNeeded (per work order, 2026-11-18)", () => {
  const D = "2026-11-18";
  const row = (id, depart, fin) => ({ id, job_date: D, depart, arrivee: null, fin, km_total: 0, km_aller: 0, km_retour: 0, overtime_evidence_captured: false });
  const ask = (jobs, args) => overtimeEvidenceNeeded(createFakeSupabase({ tables: { jobs } }).client, { userId: "u", jobDate: D, firstTripUnpaid: false, ...args });

  it("asks for the job that crosses the line and for each job after it", async () => {
    const jobs = [row("a", "06:00", "12:00"), { ...row("b", "12:00", "15:00"), overtime_evidence_captured: true }];
    // a new 1 h job after the line: its own proof is needed although b already has one
    expect((await ask(jobs, { editId: null, thisMinutes: 60, current: { job_date: D, depart: "15:00", fin: "16:00" } })).needed).toBe(true);
  });

  it("does not ask for a job under the line, nor again for a job that already carries its proof", async () => {
    const jobs = [row("a", "06:00", "12:00"), { ...row("b", "12:00", "15:00"), overtime_evidence_captured: true }];
    expect((await ask(jobs, { editId: "a", thisMinutes: 360, current: { job_date: D, depart: "06:00", fin: "12:00" } })).needed).toBe(false);
    expect((await ask(jobs, { editId: "b", hasOvertimeEvidence: true, thisMinutes: 180, current: { job_date: D, depart: "12:00", fin: "15:00" } })).needed).toBe(false);
  });

  it("keeps the day-level rule before the cut-over date", async () => {
    const old = (job) => ({ ...job, job_date: "2026-11-17" });
    const fake = createFakeSupabase({ tables: { jobs: [old(row("a", "06:00", "12:00")), { ...old(row("b", "12:00", "15:00")), overtime_evidence_captured: true }] } });
    const result = await overtimeEvidenceNeeded(fake.client, { userId: "u", jobDate: "2026-11-17", editId: null, thisMinutes: 60, current: { job_date: "2026-11-17", depart: "15:00", fin: "16:00" }, firstTripUnpaid: false });
    expect(result.needed).toBe(false); // another job of the day already has the proof
  });
});
