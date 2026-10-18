import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  TRAVEL_RULES, TRAVEL_RULE_KEYS, TRAVEL_RULE_SECTIONS, currentTravelRules, isValidTravelChoice,
  summarizeTravelRule, travelRuleEmployees, travelRuleValue, weekStartOf,
} from "./travel-rules";

const migration = readFileSync(
  `supabase/migrations/${readdirSync("supabase/migrations").find((f) => f.includes("_0101_travel_pay_rules"))}`, "utf8");

describe("travel rules catalogue", () => {
  it("every line has a default among its own choices, and keys are unique", () => {
    for (const r of TRAVEL_RULES) expect(r.choices).toContain(r.defaultChoice);
    expect(new Set(TRAVEL_RULE_KEYS).size).toBe(TRAVEL_RULE_KEYS.length);
    expect(TRAVEL_RULE_SECTIONS.map((s) => s.id)).toEqual(["time", "km", "amounts"]);
  });

  it("defaults = what the app pays today", () => {
    const d = Object.fromEntries(TRAVEL_RULES.map((r) => [r.key, r.defaultChoice]));
    expect(d).toMatchObject({
      time_home_to_first_client: "ccq", time_return_to_warehouse: "ccq", time_client_to_home: "unpaid",
      km_home_to_first_client: "reimbursed", km_client_to_warehouse: "reimbursed", km_client_to_home: "not_reimbursed",
      parking: "reimbursed", supper: "reimbursed", ferry: "not_reimbursed", far_site_65km: "unpaid",
    });
  });

  it("matches the database check constraint (migration 0101): same keys, same choice sets", () => {
    for (const r of TRAVEL_RULES) {
      expect(migration).toContain(`'${r.key}'`);
      for (const c of r.choices) expect(isValidTravelChoice(r.key, c)).toBe(true);
    }
    const sqlKeys = [...migration.matchAll(/'((?:time|km)_[a-z0-9_]+|far_site_65km|ferry|parking|supper)'/g)].map((m) => m[1]);
    expect(new Set(sqlKeys)).toEqual(new Set(TRAVEL_RULE_KEYS));
    expect(isValidTravelChoice("km_client_to_home", "ccq")).toBe(false);
    expect(isValidTravelChoice("time_client_to_home", "reimbursed")).toBe(false);
  });

  it("writes only through the audited RPC (no write policy)", () => {
    expect(migration).toMatch(/for select to authenticated/);
    expect(migration).not.toMatch(/for (insert|update|delete|all) to authenticated/);
    expect(migration).toContain("'travel_rule_set'");
    expect(migration).toContain("role in ('manager', 'owner')");
  });
});

describe("in-force setting and summaries", () => {
  const rows = [
    { user_id: "a", rule_key: "time_client_to_home", effective_from: "2026-10-11", choice: "non_ccq", billed_to_britton: true, threshold_km: 65 },
    { user_id: "a", rule_key: "time_client_to_home", effective_from: "2026-11-01", choice: "ccq", billed_to_britton: true, threshold_km: 80 },
    { user_id: "b", rule_key: "time_client_to_home", effective_from: "2026-10-11", choice: "non_ccq", billed_to_britton: false },
  ];

  it("takes the latest row on or before the day; a later row is a planned change", () => {
    const now = currentTravelRules(rows, "2026-10-20");
    expect(travelRuleValue(now, "a", "time_client_to_home")).toEqual({ choice: "non_ccq", britton: true, thresholdKm: 65, isSet: true });
    const later = currentTravelRules(rows, "2026-11-02");
    expect(travelRuleValue(later, "a", "time_client_to_home").choice).toBe("ccq");
    expect(travelRuleValue(later, "a", "time_client_to_home").thresholdKm).toBe(80);
  });

  it("an employee without a setting gets the default (and the default threshold)", () => {
    const now = currentTravelRules(rows, "2026-10-20");
    expect(travelRuleValue(now, "c", "time_client_to_home")).toEqual({ choice: "unpaid", britton: null, thresholdKm: 65, isSet: false });
  });

  it("summarises a line over the employees", () => {
    const now = currentTravelRules(rows, "2026-10-20");
    const s = summarizeTravelRule(now, "time_client_to_home", [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(s).toEqual({ counts: { non_ccq: 2, unpaid: 1 }, unset: 1, britton: { yes: 1, no: 1, unknown: 1 }, total: 3, uniform: null });
    expect(summarizeTravelRule(now, "time_client_to_home", [{ id: "a" }, { id: "b" }]).uniform).toBe("non_ccq");
  });

  it("lists active CCQ tradespeople only", () => {
    const people = [
      { id: "1", full_name: "Zoé", role: "employee" }, { id: "2", full_name: "Alex", role: "manager" },
      { id: "3", full_name: "Bureau", role: "admin" }, { id: "4", full_name: "Patronne", role: "owner" },
      { id: "5", full_name: "Sous", role: "subcontractor_1" }, { id: "6", full_name: "Parti", role: "employee", is_paused: true },
    ];
    expect(travelRuleEmployees(people).map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("defaults the effective date to the Sunday of the week", () => {
    expect(weekStartOf("2026-10-18")).toBe("2026-10-18");
    expect(weekStartOf("2026-10-21")).toBe("2026-10-18");
  });
});
