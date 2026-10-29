import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const {
  cleanGroupName, groupNameTaken, groupsTargetIds, memberChanges, normalizeGroups,
  pendingNewHires, ungroupedPeople,
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

describe("ungroupedPeople (Groupes › Employés sans groupe)", () => {
  const today = "2026-10-26";
  const groups = [{ id: "g1", memberIds: ["a"] }, { id: "g2", memberIds: ["b"] }];
  const people = [
    { id: "a", full_name: "Alice", role: "employee" },
    { id: "b", full_name: "Bruno", role: "subcontractor_1" },
    { id: "z", full_name: "Zoé", role: "employee" },
    { id: "c", full_name: "Chloé", role: "subcontractor_1" },
    { id: "n", full_name: "Nadia", role: "employee", is_paused: true, start_date: "2026-11-02" },
    { id: "p", full_name: "Paul", role: "employee", is_paused: true },
    { id: "f", full_name: "Félix", role: "employee", departure_status: "depart" },
    { id: "o", full_name: "Olivia", role: "admin" },
    { id: "m", full_name: "Marc", role: "manager" },
    { id: "k", full_name: "Karine", role: "owner" },
  ];

  it("lists active field people and new hires in no group, by name", () => {
    expect(ungroupedPeople(groups, people, today).map((p) => p.id)).toEqual(["c", "n", "z"]);
  });

  it("leaves out office, managers, owner, paused and former accounts", () => {
    const ids = ungroupedPeople([], people, today).map((p) => p.id);
    for (const id of ["o", "m", "k", "p", "f"]) expect(ids).not.toContain(id);
  });

  it("is empty when everyone is grouped", () => {
    expect(ungroupedPeople([{ id: "g", memberIds: ["a", "b", "c", "n", "z"] }], people, today)).toEqual([]);
  });
});
