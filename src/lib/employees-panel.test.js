import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { ccqRateFor, defaultAnnex, employeeCounts, filterEmployees, rateSuggestionsFor, ratesFromSnapshots, sortEmployees } from "./employees-panel";

const TODAY = "2026-10-25";
const t = (key) => key;
const snapshot = (skill, rate, fetched = "2026-10-01") => ({
  sector_id: "C", skill_id: skill, fetched_at: fetched,
  raw_json: { Annexes: [{ cd_annexe: "C3" }, { cd_annexe: "C1" }], AnnexesRates: { "Taux horaire": [{ Name: "Régulier", Rates: { C3: rate, C1: "30,00" } }] } },
});

describe("ratesFromSnapshots", () => {
  it("keeps the newest snapshot of each sector, skill and annex", () => {
    const { rates, annexes } = ratesFromSnapshots([snapshot("6", "45,50"), snapshot("6", "40,00", "2026-01-01"), snapshot("4", "38,10")]);
    expect(ccqRateFor("compagnon", "C3", rates)).toBe(45.5);
    expect(ccqRateFor("apprenti_4", "C3", rates)).toBe(38.1);
    expect(ccqRateFor("compagnon", "C1", rates)).toBe(30);
    expect(annexes.get("C").map((a) => a.code)).toEqual(["C3", "C1"]);
  });

  it("pays on the employee's annex, else C3, else the first published", () => {
    const { annexes } = ratesFromSnapshots([snapshot("6", "45,50")]);
    expect(defaultAnnex({ wage_schedule: "C1" }, annexes)).toBe("C1");
    expect(defaultAnnex({}, annexes)).toBe("C3");
    expect(defaultAnnex({}, new Map([["C", [{ code: "C2" }]]]))).toBe("C2");
    expect(defaultAnnex({}, new Map())).toBeUndefined();
  });
});

describe("rateSuggestionsFor", () => {
  const { rates, annexes } = ratesFromSnapshots([snapshot("6", "45,50")]);
  it("flags only a CCQ tradesperson whose rate or annex differs", () => {
    const suggestions = rateSuggestionsFor([
      { id: "a", role: "employee", apprentice_level: "compagnon", hourly_rate: 40, wage_schedule: "C3" },
      { id: "b", role: "employee", apprentice_level: "compagnon", hourly_rate: 45.5, wage_schedule: "C3" },
      { id: "c", role: "employee", apprentice_level: "compagnon", hourly_rate: 45.5, wage_schedule: null },
      { id: "d", role: "admin", apprentice_level: "compagnon", hourly_rate: 20 },
      { id: "e", role: "owner", apprentice_level: "compagnon", hourly_rate: 51 },
      { id: "f", role: "subcontractor_1", apprentice_level: "compagnon", hourly_rate: 60 },
      { id: "g", role: "manager", apprentice_level: "compagnon", hourly_rate: 1 },
      { id: "h", role: "employee", apprentice_level: null, hourly_rate: 1 },
    ], rates, annexes);
    expect([...suggestions.keys()]).toEqual(["a", "c"]);
    expect(suggestions.get("a")).toEqual({ rate: 45.5, annex: "C3", current: 40 });
  });
});

describe("sortEmployees, counters and filters", () => {
  const pending = new Map([["new", { email_confirmed: true }]]);
  const people = [
    { id: "z", role: "employee", full_name: "Zed", is_paused: false },
    { id: "old", role: "employee", full_name: "Ancien", is_paused: true, departure_status: "depart" },
    { id: "new", role: "employee", full_name: "Nouveau", is_paused: true },
    { id: "soon", role: "employee", full_name: "Bientôt", is_paused: false, start_date: "2026-11-02" },
    { id: "boss", role: "owner", full_name: "Patronne", is_paused: false },
    { id: "a", role: "employee", full_name: "Alice", is_paused: false },
  ];

  it("orders by role, then sign-ups, people waiting to start, active and inactive, then by name", () => {
    expect(sortEmployees(people, pending, TODAY).map((p) => p.id)).toEqual(["boss", "new", "soon", "a", "z", "old"]);
  });

  it("counts each state", () => {
    const pushSet = new Set(["a"]);
    expect(employeeCounts(people, { pending, pushSet, today: TODAY, t })).toMatchObject({
      active: 3, inactive: 2, pending: 1, former: 1, new_hire: 1, noPush: 2,
    });
    expect(employeeCounts(people, { pending, pushSet: null, today: TODAY, t }).noPush).toBe(0);
  });

  it("filters on a counter", () => {
    const options = { pending, pushSet: new Set(["a", "boss"]), today: TODAY };
    expect(filterEmployees(people, "all", options)).toHaveLength(6);
    expect(filterEmployees(people, "pending", options).map((p) => p.id)).toEqual(["new"]);
    expect(filterEmployees(people, "former", options).map((p) => p.id)).toEqual(["old"]);
    expect(filterEmployees(people, "new_hire", options).map((p) => p.id)).toEqual(["soon"]);
    expect(filterEmployees(people, "noPush", options).map((p) => p.id)).toEqual(["z"]);
  });
});
