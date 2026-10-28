// @vitest-environment jsdom
// Minimum stock per warehouse (0121): warehouses below their minimum are listed with the ratio that
// produced it; the manager adds a ratio (comma accepted) for a device seen on recent lists.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: InventoryRatios } = await import("./InventoryRatios");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const level = (extra) => ({
  group_id: "g1", group_name: "Entrepôt Laval", code: "EQ000001", item_name: "Thermostat", per_employee: 2, headcount: 10,
  minimum: 20, on_hand: 12, lists_counted: 4, is_low: true, ...extra,
});

function setup(levels) {
  state.fake = createFakeSupabase({
    tables: {
      employee_groups: [{ id: "g1", name: "Entrepôt Laval", note: null, employee_group_members: [{ user_id: "a" }, { user_id: "b" }] }],
      inventory_items: [{ code: "EQ000009", name: "Gradateur mural" }],
      inventory_min_ratios: (call) => (call.op === "select" ? [] : null),
    },
    rpcs: { inventory_stock_levels: levels },
  });
  return render(<InventoryRatios />);
}

afterEach(cleanup);

describe("InventoryRatios", () => {
  it("lists the devices below the minimum with how it was computed", async () => {
    setup([level(), level({ code: "EQ000002", item_name: "Capteur", on_hand: 30, is_low: false })]);
    await screen.findByText(fr("mgr.inventory.ratios.lowTitle", { count: 1 }));
    expect(screen.getByText(/Thermostat/)).toBeTruthy();
    expect(screen.getByText(fr("mgr.inventory.ratios.lowLine", { onHand: "12", minimum: "20", ratio: "2", count: "10" }))).toBeTruthy();
    expect(screen.queryByText(/Capteur/)).toBeNull();
  });

  it("stays calm when nothing is below its minimum", async () => {
    setup([level({ is_low: false, on_hand: 25 })]);
    await screen.findByText(fr("mgr.inventory.ratios.title"));
    expect(screen.queryByText(/sous le stock minimum/)).toBeNull();
  });

  it("refuses a ratio of 0 and saves a ratio typed with a comma", async () => {
    setup([]);
    fireEvent.click(await screen.findByRole("button", { name: fr("mgr.inventory.ratios.manage") }));
    const item = await screen.findByLabelText(fr("mgr.inventory.colItem"));
    await waitFor(() => expect(item.querySelectorAll("option").length).toBeGreaterThan(1));
    fireEvent.change(item, { target: { value: "EQ000009" } });
    const ratio = screen.getByLabelText(fr("mgr.inventory.ratios.perEmployee"));
    fireEvent.change(ratio, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: fr("mgr.inventory.ratios.add") }));
    expect(await screen.findByText(fr("mgr.inventory.ratios.invalid"))).toBeTruthy();
    expect(state.fake.calls.some((call) => call.table === "inventory_min_ratios" && call.op === "upsert")).toBe(false);

    fireEvent.change(ratio, { target: { value: "0,5" } });
    fireEvent.click(screen.getByRole("button", { name: fr("mgr.inventory.ratios.add") }));
    await waitFor(() => expect(state.fake.calls.some((call) => call.table === "inventory_min_ratios" && call.op === "upsert")).toBe(true));
    const saved = state.fake.calls.find((call) => call.table === "inventory_min_ratios" && call.op === "upsert");
    expect(saved.payload).toMatchObject({ group_id: "g1", code: "EQ000009", name: "Gradateur mural", per_employee: 0.5 });
  });
});
