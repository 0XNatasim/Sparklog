import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("../supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));

const { alertDisplayName, groupInventoryNegativeAlerts, namesForAlerts } = await import("./inventory-alerts");

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("groupInventoryNegativeAlerts", () => {
  it("builds one card per employee and day, with each negative item", () => {
    const cards = groupInventoryNegativeAlerts([
      { user_id: "a", full_name: "Adam", job_date: "2026-10-18", code: "EQ000002", item_name: "Lampe", quantity: -2 },
      { user_id: "a", full_name: "Adam", job_date: "2026-10-18", code: "EQ000001", item_name: "Ampoule", quantity: -1 },
      { user_id: "b", full_name: "Zoe", job_date: "2026-10-19", code: "EQ000009", item_name: "Fil", quantity: "-3.5" },
    ]);
    expect(cards).toEqual([
      {
        userId: "b",
        jobDate: "2026-10-19",
        name: "Zoe",
        items: [{ code: "EQ000009", name: "Fil", quantity: "-3.5" }],
      },
      {
        userId: "a",
        jobDate: "2026-10-18",
        name: "Adam",
        items: [
          { code: "EQ000001", name: "Ampoule", quantity: -1 },
          { code: "EQ000002", name: "Lampe", quantity: -2 },
        ],
      },
    ]);
  });

  it("keeps one line when the same code is repeated and falls back to the id", () => {
    const cards = groupInventoryNegativeAlerts([
      { user_id: "a", full_name: "  ", job_date: "2026-10-18", code: "EQ000001", item_name: "Ampoule", quantity: -1 },
      { user_id: "a", full_name: "Adam", job_date: "2026-10-18", code: "EQ000001", item_name: "Ampoule", quantity: -4 },
      { user_id: "a", job_date: null, code: "EQ000003", item_name: "Ignore" },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("a");
    expect(cards[0].items).toEqual([{ code: "EQ000001", name: "Ampoule", quantity: -1 }]);
  });

  it("uses the profile name when the alert row has only the account id", () => {
    const named = namesForAlerts(
      [{ user_id: "employee-1", job_date: "2026-10-19", negative_count: 1 }],
      [{ id: "employee-1", full_name: "Alex Martin", email: "alex@example.com" }]
    );
    expect(groupInventoryNegativeAlerts(named)[0].name).toBe("Alex Martin");
    expect(alertDisplayName(
      { userId: "employee-1", name: "employee-1" },
      [{ id: "employee-1", full_name: "Alex Martin" }]
    )).toBe("Alex Martin");
  });

  it("returns nothing for an empty list", () => {
    expect(groupInventoryNegativeAlerts(null)).toEqual([]);
    expect(groupInventoryNegativeAlerts([])).toEqual([]);
  });
});

describe("negative inventory notice", () => {
  const migration = read("../../supabase/migrations/20261020190000_0105_dismiss_inventory_negative_alert.sql");

  it("hides a dismissed employee-day and does not delete the quantities", () => {
    expect(migration).toContain("inventory_alert_dismissals");
    expect(migration).toContain("dismiss_inventory_negative_alert");
    expect(migration).toContain("not exists");
    expect(migration).not.toMatch(/delete from public\.inventory_items/i);
  });

  it("stops the menu click from clearing the notice", () => {
    const layout = read("../components/manager/ManagerLayout.jsx");
    expect(layout).not.toContain("inventory-clear");
    expect(layout).not.toContain("clearInventoryNegatives");
    expect(layout).toContain("groupInventoryNegativeAlerts");
  });
});
