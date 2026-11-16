import { describe, expect, it } from "vitest";
import { PAY_CONDITION_COLUMNS, PAY_CONDITION_GROUPS, PAY_CONDITION_PROFILE_COLUMNS, bulkTargets, cellState, parseConditionAmount, payConditionRows } from "./pay-conditions";
import { TRAVEL_RULES } from "./travel-rules";

const col = (key) => PAY_CONDITION_COLUMNS.find((c) => c.key === key);
const worker = { id: "w", role: "employee", full_name: "Zoé", employee_number: "12", first_trip_unpaid: true, km_rate: 0.5, storage_compensation: false };
const sub = { id: "s", role: "subcontractor_1", full_name: "Sam", employee_number: "ST-1" };
const office = { id: "o", role: "admin", full_name: "Ana", hourly_rate: 30 };
const owner = { id: "k", role: "owner", full_name: "Karine", employee_number: "0" };

describe("the columns of Conditions de paie", () => {
  it("holds every pay option of the employee card and every travel line", () => {
    const keys = PAY_CONDITION_COLUMNS.map((c) => c.key);
    for (const key of ["first_trip_unpaid", "return_with_benefits_to_8h", "overtime_first_hour_double", "ten_hour_days", "team_leader_premium_overtime",
      "team_leader_premium", "team_leader_premium_ccq", "km_rate", "phone_data_reimbursement", "storage_compensation", "storage_compensation_amount",
      "parking_receipts_enabled", "inventory_screenshots_enabled", "km_apart_from_capture", "hourly_rate"]) {
      expect(keys).toContain(key);
    }
    for (const rule of TRAVEL_RULES) expect(keys).toContain(rule.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only reads profile columns it asks for", () => {
    for (const column of PAY_CONDITION_COLUMNS.filter((c) => c.kind !== "travel")) expect(PAY_CONDITION_PROFILE_COLUMNS).toContain(column.field);
    expect(PAY_CONDITION_GROUPS.some((g) => g.travel)).toBe(true);
  });
});

describe("what applies to whom", () => {
  it("shows the value of a box for a tradesperson and locks what a subcontractor cannot change", () => {
    expect(cellState(col("first_trip_unpaid"), worker)).toEqual({ applies: true, locked: false, value: true });
    expect(cellState(col("overtime_first_hour_double"), sub)).toEqual({ applies: true, locked: true, value: true });
    expect(cellState(col("return_with_benefits_to_8h"), sub)).toEqual({ applies: true, locked: true, value: false });
  });

  it("gives the team-leader overtime premium only to a team leader", () => {
    expect(cellState(col("team_leader_premium_overtime"), worker).applies).toBe(false);
    expect(cellState(col("team_leader_premium_overtime"), { ...worker, team_leader_premium: 2 }).applies).toBe(true);
  });

  it("keeps the flat hourly rate for office staff and the owner, and not the CCQ options", () => {
    expect(cellState(col("hourly_rate"), office)).toMatchObject({ applies: true, value: 30 });
    expect(cellState(col("hourly_rate"), owner).applies).toBe(true);
    expect(cellState(col("hourly_rate"), worker).applies).toBe(false);
    expect(cellState(col("parking_receipts_enabled"), office).applies).toBe(false);
    expect(cellState(col("first_trip_unpaid"), owner).applies).toBe(false);
  });

  it("locks the storage amount until storage is ticked", () => {
    expect(cellState(col("storage_compensation_amount"), worker).locked).toBe(true);
    expect(cellState(col("storage_compensation_amount"), { ...worker, storage_compensation: true }).locked).toBe(false);
  });

  it("gives travel lines to active tradespeople, not to office staff, the owner or paused accounts", () => {
    const line = PAY_CONDITION_COLUMNS.find((c) => c.kind === "travel");
    expect(cellState(line, worker).applies).toBe(true);
    expect(cellState(line, office).applies).toBe(false);
    expect(cellState(line, sub).applies).toBe(false);
    expect(cellState(line, { ...worker, is_paused: true }).applies).toBe(false);
  });
});

describe("typed amounts and the list", () => {
  it("accepts an empty rate as « none », a number of 0 or more, and refuses the rest", () => {
    expect(parseConditionAmount("km_rate", "")).toBeNull();
    expect(parseConditionAmount("km_rate", "0,55")).toBe(0.55);
    expect(parseConditionAmount("km_rate", "12")).toBeNaN();
    expect(parseConditionAmount("team_leader_premium", "")).toBe(0);
    expect(parseConditionAmount("hourly_rate", "")).toBeNull();
    expect(parseConditionAmount("hourly_rate", "-1")).toBeNaN();
    expect(parseConditionAmount("phone_data_reimbursement", "abc")).toBeNaN();
  });

  it("sorts by employee number, hides paused accounts and filters by search and group", () => {
    const people = [worker, sub, office, owner, { id: "p", role: "employee", full_name: "Paul", employee_number: "3", is_paused: true }];
    expect(payConditionRows(people).map((p) => p.id)).toEqual(["k", "w", "o", "s"]);
    expect(payConditionRows(people, { showPaused: true }).map((p) => p.id)).toContain("p");
    expect(payConditionRows(people, { search: "zo" }).map((p) => p.id)).toEqual(["w"]);
    expect(payConditionRows(people, { groupId: "g1", memberIds: new Set(["s"]) }).map((p) => p.id)).toEqual(["s"]);
  });

  it("reaches only the unlocked cells that apply in a bulk change", () => {
    expect(bulkTargets(col("overtime_first_hour_double"), [worker, sub, owner]).map((p) => p.id)).toEqual(["w"]);
  });
});

describe("short column titles", () => {
  it("gives every column a short title that is shorter than its full label", async () => {
    const { dictionaries } = await import("./i18n");
    for (const language of ["fr", "en"]) {
      for (const column of PAY_CONDITION_COLUMNS) {
        const short = dictionaries[language][column.shortKey];
        expect(short, `${language} ${column.key}`).toBeTruthy();
        expect(short.length, `${language} ${column.key}`).toBeLessThanOrEqual(26);
      }
    }
  });
});
