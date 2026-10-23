import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const {
  cleanGroupName, groupNameTaken, groupsTargetIds, inventoryGroupChoices, memberChanges, normalizeGroups,
  pendingNewHires, sumGroupInventory,
} = await import("@/lib/employee-groups");

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const rows = [
  { id: "g2", name: "Entrepôt Laval", note: null, employee_group_members: [{ user_id: "a" }, { user_id: "b" }, { user_id: "a" }] },
  { id: "g1", name: "entrepôt Gatineau", note: "Rue X", employee_group_members: [{ user_id: "b" }, { user_id: "c" }, { user_id: "n" }] },
];
const groups = normalizeGroups(rows);
const active = [
  { id: "a", full_name: "Alice" },
  { id: "b", full_name: "Bob" },
  { id: "n", full_name: "Nouveau", start_date: "2026-11-02" },
];

describe("employee groups (0114)", () => {
  it("normalizes rows: one id per member, groups sorted by name", () => {
    expect(groups.map((g) => g.name)).toEqual(["entrepôt Gatineau", "Entrepôt Laval"]);
    expect(groups.find((g) => g.id === "g2").memberIds).toEqual(["a", "b"]);
    expect(groups.find((g) => g.id === "g1").note).toBe("Rue X");
  });

  it("checks names like the unique index (case and spaces ignored)", () => {
    expect(cleanGroupName("  Entrepôt   Laval ")).toBe("Entrepôt Laval");
    expect(cleanGroupName("   ")).toBeNull();
    expect(cleanGroupName("x".repeat(61))).toBeNull();
    expect(groupNameTaken(groups, "  ENTREPÔT laval")).toBe(true);
    expect(groupNameTaken(groups, "Entrepôt Laval", "g2")).toBe(false);
    expect(groupNameTaken(groups, "Entrepôt Québec")).toBe(false);
  });

  it("sends to each active member once; inactive members (not in the list) are left out", () => {
    expect(groupsTargetIds(groups, ["g1", "g2"], active)).toEqual(["a", "b", "n"]);
    expect(groupsTargetIds(groups, ["g1"], active)).toEqual(["b", "n"]); // c is paused (not in the list)
    expect(groupsTargetIds(groups, [], active)).toEqual([]);
  });

  it("finds the new hires waiting to start among the recipients, and only them", () => {
    expect(pendingNewHires(active, ["a", "b", "n"], "2026-10-23").map((p) => p.id)).toEqual(["n"]);
    expect(pendingNewHires(active, ["a", "b"], "2026-10-23")).toEqual([]);
    expect(pendingNewHires(active, ["n"], "2026-11-02")).toEqual([]); // first day: started
  });

  it("writes only the member changes", () => {
    expect(memberChanges(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] });
    expect(memberChanges([], [])).toEqual({ add: [], remove: [] });
  });

  it("totals a group's inventory like a region", () => {
    const entries = [
      { person: { id: "a" }, name: "Alice", state: "ok", items: [{ code: "T1", name: "Thermostat", quantity: 2 }] },
      { person: { id: "b" }, name: "Bob", state: "ok", items: [{ code: "T1", name: "Thermostat", quantity: 3 }] },
      { person: { id: "z" }, name: "Zed", state: "ok", items: [{ code: "T1", name: "Thermostat", quantity: 9 }] },
    ];
    expect(inventoryGroupChoices(groups, entries).map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(inventoryGroupChoices(groups, [entries[2]])).toEqual([]);
    const laval = sumGroupInventory(entries, groups.find((g) => g.id === "g2"));
    expect(laval.counted).toBe(2);
    expect(laval.rows[0].total).toBe(5);
  });

  it("is manager-level only in the database", () => {
    const sql = read("supabase/migrations/20261023150000_0114_employee_groups.sql");
    expect(sql.match(/using \(public\.get_my_role\(\) = 'manager'\)/g)).toHaveLength(2);
    expect(sql.match(/with check \(public\.get_my_role\(\) = 'manager'\)/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on public.employee_groups from anon, public;");
    expect(sql).toContain("on public.employee_groups (lower(btrim(name)))");
    expect(sql).toContain("references public.profiles(id) on delete cascade");
  });

  it("Communications asks about new hires for « Tous » and groups, never for people ticked one by one", () => {
    const src = read("src/components/BroadcastManager.jsx");
    expect(src).toContain('if (audience !== "selected") {');
    expect(src).toContain("pendingNewHires(employees, targetIds, companyDate())");
    expect(src).toContain("if (waiting.length) {");
    expect(src).toContain('audience: audience === "groups" ? "selected" : audience');
  });
});
