import { describe, expect, it, vi } from "vitest";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const { VERDICTS, buildOtComparison, comparisonDays, countVerdicts, filterComparison, brittonDays } = await import("./ot-compare");

const DAY = "2026-11-19";
// A 10 h day (06:30 -> 16:30, no return): 120 minutes past the 8 h line, all of them on this one work order.
const job = (id, extra = {}) => ({ id, user_id: "u1", job_date: DAY, status: "submitted", ot: "OT-211794", depart: "06:30", arrivee: "07:00", fin: "16:30", return_time_minutes: 0, ...extra });
const person = (extra = {}) => ({ id: "u1", full_name: "Anthony Fortin", first_trip_unpaid: false, ten_hour_days: false, ...extra });
const line = (id, extra = {}) => ({ id, job_date: DAY, ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", client_minutes: 120, return_minutes: 0, total_minutes: 120, note: null, ...extra });
const proof = (id, extra = {}) => ({ id, jobId: "j1", userId: "u1", name: "Anthony Fortin", jobDate: DAY, jobOt: "OT-211794", state: "ok", createdAt: "2026-11-19T22:00:00Z", found: { ot: "211794", clientMinutes: 120, returnMinutes: 0 }, ...extra });
const people = new Map([["u1", person()]]);
const build = (over = {}) => buildOtComparison({ proofRows: [proof("p1")], britton: [line("b1")], jobs: [job("j1")], people, ...over });

describe("buildOtComparison", () => {
  it("puts the three sources of one work order side by side; all agree = ok", () => {
    const [entry] = build();
    expect(entry).toMatchObject({ verdict: "ok", ot: "211794", name: "Anthony Fortin" });
    expect(entry.sparklog).toEqual({ client: 120, return: 0 });
    expect(entry.brittonValues).toEqual({ client: 120, return: 0 });
    expect(entry.form).toEqual({ client: 120, return: 0 });
    expect([...entry.red.britton, ...entry.red.form, ...entry.red.sparklog]).toEqual([]);
  });

  it("Britton against the timesheet: brittonGap, and the odd source is the one in red (form agrees with the timesheet)", () => {
    const [entry] = build({ britton: [line("b1", { client_minutes: 60, total_minutes: 60 })] });
    expect(entry.verdict).toBe("brittonGap");
    expect([...entry.red.britton]).toEqual(["client"]);
    expect([...entry.red.form, ...entry.red.sparklog]).toEqual([]);
  });

  it("the form alone differs (Britton = timesheet): formGap, the form in red", () => {
    const [entry] = build({ proofRows: [proof("p1", { found: { ot: "211794", clientMinutes: 167, returnMinutes: 0 } })] });
    expect(entry.verdict).toBe("formGap");
    expect([...entry.red.form]).toEqual(["client"]);
  });

  it("uses the tolerances of the proofs (15 min at the client, 5 min return) before calling a gap", () => {
    expect(build({ britton: [line("b1", { client_minutes: 105 })] })[0].verdict).toBe("ok");
    expect(build({ britton: [line("b1", { client_minutes: 100 })] })[0].verdict).toBe("brittonGap");
    expect(build({ britton: [line("b1", { return_minutes: 5 })] })[0].verdict).toBe("ok");
    expect(build({ britton: [line("b1", { return_minutes: 10 })] })[0].verdict).toBe("brittonGap");
  });

  it("no proof sent but Britton and the timesheet agree: noProof", () => {
    expect(build({ proofRows: [] })[0].verdict).toBe("noProof");
  });

  it("overtime in Sparklog with no Britton line: missingBritton (minutes not reimbursed)", () => {
    const entries = build({ britton: [line("b2", { ot: "999999", employee_name: "Autre Personne", name_key: "autre personne" })], proofRows: [] });
    expect(entries.find((entry) => entry.job)).toMatchObject({ verdict: "missingBritton", ot: "211794" });
  });

  it("a Britton line with no Sparklog work order that day and OT: missingSparklog", () => {
    const entries = build({ britton: [line("b1"), line("b9", { ot: "555555", employee_name: "Autre Personne", name_key: "autre personne" })] });
    expect(entries.find((entry) => entry.verdict === "missingSparklog")).toMatchObject({ ot: "555555", name: "Autre Personne", job: null });
  });

  it("a work order under the line is not overtime: no entry unless a proof or a Britton line points at it", () => {
    const short = [job("j1", { fin: "14:00" })]; // 7 h 30
    expect(build({ jobs: short, proofRows: [], britton: [line("b2", { ot: "999999", name_key: "x", employee_name: "X" })] }).filter((entry) => entry.job)).toEqual([]);
    const [withLine] = build({ jobs: short, proofRows: [] });
    expect(withLine.verdict).toBe("brittonGap"); // Britton approved 120 min, the timesheet says 0
  });

  it("two electricians on the same OT: the line of the same name goes to the right entry; a different spelling still matches when alone", () => {
    const jobs = [job("j1"), job("j2", { user_id: "u2" })];
    const both = new Map([["u1", person()], ["u2", person({ id: "u2", full_name: "Tian-Yi Zhang" })]]);
    const lines = [line("b1", { client_minutes: 120 }), line("b2", { employee_name: "Tianyi Zhang", name_key: "tianyi zhang", client_minutes: 120 })];
    const entries = buildOtComparison({ proofRows: [], britton: lines, jobs, people: both });
    expect(entries.map((entry) => [entry.name, entry.britton?.id, entry.verdict]).sort()).toEqual([["Anthony Fortin", "b1", "noProof"], ["Tian-Yi Zhang", "b2", "noProof"]]);
  });

  it("a work order under the line of someone else on the same OT is dropped when no Britton line ends up on it", () => {
    const jobs = [job("j1"), job("j2", { user_id: "u2", fin: "14:00" })]; // u1 past the line, u2 under it, same OT
    const both = new Map([["u1", person()], ["u2", person({ id: "u2", full_name: "Blaise Deux" })]]);
    const entries = buildOtComparison({ proofRows: [], britton: [line("b1")], jobs, people: both });
    expect(entries.map((entry) => entry.name)).toEqual(["Anthony Fortin"]);
  });

  it("a line that ends the next morning goes with the work order of the day before; the Sparklog day stays the work day", () => {
    const entries = build({ britton: [line("b1", { job_date: "2026-11-20" })], proofRows: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ verdict: "noProof", jobDate: DAY, ot: "211794" });
    expect(entries[0].britton.id).toBe("b1");
  });

  it("a line three days after the work day does not match it: both sides are listed", () => {
    const entries = build({ britton: [line("b1", { job_date: "2026-11-22" })], proofRows: [] });
    expect(entries.map((entry) => entry.verdict).sort()).toEqual(["missingSparklog"]); // the work day is not a Britton day: no « not at Britton » noise
    expect(entries[0].job).toBeNull();
  });

  it("only compares the days Britton sent: another day with overtime is ignored", () => {
    const entries = build({ jobs: [job("j1"), job("j7", { job_date: "2026-11-20", id: "j7" })] });
    expect(entries.filter((entry) => entry.jobDate === "2026-11-20")).toEqual([]);
  });

  it("the unpaid first trip and the 10-hour day change which work orders are past the line", () => {
    const tenHours = new Map([["u1", person({ ten_hour_days: true })]]);
    // 10 h day with the « 4 jours de 10 h » option: exactly on the line, no overtime at all.
    expect(build({ people: tenHours, proofRows: [], britton: [line("b2", { ot: "999999", name_key: "x", employee_name: "X" })] }).filter((entry) => entry.job)).toEqual([]);
  });

  it("odd one out with three sources that all differ: all red", () => {
    const [entry] = build({ britton: [line("b1", { client_minutes: 30 })], proofRows: [proof("p1", { found: { ot: "211794", clientMinutes: 60, returnMinutes: 0 } })] });
    expect([...entry.red.britton, ...entry.red.form, ...entry.red.sparklog].sort()).toEqual(["client", "client", "client"]);
  });
});

describe("counting, filtering, days", () => {
  it("counts each verdict, filters to what needs attention by default, by day and by name or OT", () => {
    const entries = build({ britton: [line("b1", { client_minutes: 60 }), line("b9", { ot: "555555", employee_name: "Autre", name_key: "autre" })] });
    const counts = countVerdicts(entries);
    expect(Object.keys(counts)).toEqual(VERDICTS);
    expect(counts.brittonGap).toBe(1);
    expect(counts.missingSparklog).toBe(1);
    expect(filterComparison(entries)).toHaveLength(2);
    expect(filterComparison(entries, { verdict: "ok" })).toHaveLength(0);
    expect(filterComparison(entries, { verdict: "all", query: "555" })).toHaveLength(1);
    expect(filterComparison(entries, { verdict: "all", day: "2026-11-20" })).toHaveLength(0);
  });
  it("reads the Britton days and the two days before each (a line ends the work day or shortly after)", () => {
    expect(comparisonDays([line("a", { job_date: "2026-11-20" })])).toEqual(["2026-11-20", "2026-11-19", "2026-11-18"]);
    expect(comparisonDays([line("a", { job_date: "2026-11-20" }), line("b", { job_date: "2026-11-19" })])).toEqual(["2026-11-20", "2026-11-19", "2026-11-18", "2026-11-17"]);
  });
  it("lists the Britton days, most recent first", () => {
    expect(brittonDays([line("a", { job_date: "2026-11-18" }), line("b"), line("c", { job_date: "2026-11-18" })])).toEqual(["2026-11-19", "2026-11-18"]);
  });
  it("the day filter also finds a line by the day Britton's line ends (work done the 19th, form filled the 20th)", () => {
    const entries = build({ proofRows: [], britton: [line("b1", { job_date: "2026-11-20", client_minutes: 60 })] });
    expect(entries[0]).toMatchObject({ jobDate: DAY, brittonDay: "2026-11-20" });
    expect(filterComparison(entries, { verdict: "all", day: "2026-11-20" })).toHaveLength(1);
    expect(filterComparison(entries, { verdict: "all", day: DAY })).toHaveLength(1);
    expect(filterComparison(entries, { verdict: "all", day: "2026-11-21" })).toHaveLength(0);
  });

  it("remarks: OT done the day before; wrong OT number (the person's other OT listed); Britton line on another OT; no sheet", () => {
    // done the 19th, Britton ends the 20th
    const [early] = build({ proofRows: [], britton: [line("b1", { job_date: "2026-11-20", client_minutes: 60 })] });
    expect(early.remark).toEqual({ kind: "earlier", days: 1 });
    // Britton writes another OT than the one of the sheet: the person's sheet OT are listed on the Britton-only line
    const wrong = build({ proofRows: [], britton: [line("b1", { ot: "999999" })] });
    const britton = wrong.find((entry) => !entry.job);
    expect(britton.remark).toEqual({ kind: "wrongOt", ots: ["OT-211794"] });
    // ... and the sheet's overtime points at Britton's line of the same person on another OT
    expect(wrong.find((entry) => entry.job).remark).toEqual({ kind: "brittonOt", ots: ["999999"] });
    // nobody of that name worked
    const none = build({ proofRows: [], jobs: [], britton: [line("b1")] });
    expect(none[0].remark).toEqual({ kind: "noSheet" });
  });
});
