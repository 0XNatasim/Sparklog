import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { knownEquipment, lowStockCount, lowStockRows, minimumFor, parseRatio, validateRatio } from "./inventory-ratios";

describe("parseRatio", () => {
  it("accepts a decimal comma or point, rounded to 3 decimals", () => {
    expect(parseRatio("0,5")).toBe(0.5);
    expect(parseRatio(" 2.25 ")).toBe(2.25);
    expect(parseRatio("0.12345")).toBe(0.123);
  });

  it("refuses empty, zero, negative, text and absurd values", () => {
    for (const value of ["", "0", "-1", "abc", "1001", null, undefined]) expect(parseRatio(value), String(value)).toBeNull();
    expect(parseRatio("1000")).toBe(1000);
  });
});

describe("minimumFor", () => {
  it("is the ratio times the employees of the warehouse", () => {
    expect(minimumFor(0.5, 12)).toBe(6);
    expect(minimumFor(1.25, 7)).toBe(8.75);
    expect(minimumFor(2, 0)).toBe(0);
  });
});

describe("validateRatio", () => {
  const ok = { groupId: "g", code: "eq000123", name: "Thermostat", ratio: "0,5" };
  it("accepts a complete row (code in lower case too)", () => expect(validateRatio(ok)).toEqual([]));
  it("names the invalid fields", () => {
    expect(validateRatio({ ...ok, groupId: "" })).toEqual(["group"]);
    expect(validateRatio({ ...ok, code: "123" })).toEqual(["code"]);
    expect(validateRatio({ ...ok, name: " " })).toEqual(["name"]);
    expect(validateRatio({ ...ok, ratio: "0" })).toEqual(["ratio"]);
  });
});

describe("lowStockRows", () => {
  const levels = [
    { group_name: "B", code: "EQ000001", minimum: 10, on_hand: 9, is_low: true },
    { group_name: "A", code: "EQ000002", minimum: 10, on_hand: 2, is_low: true },
    { group_name: "A", code: "EQ000003", minimum: 10, on_hand: 50, is_low: false },
  ];
  it("keeps the low ones, the largest shortfall first", () => {
    expect(lowStockRows(levels).map((r) => r.code)).toEqual(["EQ000002", "EQ000001"]);
    expect(lowStockCount(levels)).toBe(2);
    expect(lowStockCount(null)).toBe(0);
  });
});

describe("knownEquipment", () => {
  it("keeps one entry per code with the longest name", () => {
    expect(knownEquipment([{ code: "EQ000001", name: "Gradateur" }, { code: "EQ000001", name: "Gradateur mural" }, { code: "EQ000002", name: "Capteur" }]))
      .toEqual([{ code: "EQ000002", name: "Capteur" }, { code: "EQ000001", name: "Gradateur mural" }]);
  });
});

describe("migration 0121", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261028150000_0121_inventory_min_ratios.sql", import.meta.url), "utf8");
  it("is manager-only and counts only unpaused members and the last 7 days", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("public.get_my_role() = 'manager'");
    expect(sql).toContain("not p.is_paused");
    expect(sql).toContain("current_date - 7");
    expect(sql).toContain("per_employee > 0");
  });
  it("raises no alert when no list was counted", () => {
    expect(sql).toMatch(/coalesce\(l\.n, 0\) > 0 and/);
  });
});
