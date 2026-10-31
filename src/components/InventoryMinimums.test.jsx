// @vitest-environment jsdom
// Minimums by warehouse (0121, 0122): the list of warehouses, a Oui / Non for each. A warehouse that is not
// counted goes no further; a counted one lists its devices with the minimum next to the total of its
// employees' inventories.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: InventoryMinimums } = await import("./InventoryMinimums");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const level = (extra) => ({
  group_id: "g1", group_name: "Entrepôt Alma", code: "EQ000016", item_name: "Thermostat intelligent Hilo 4000", per_employee: 504, headcount: 3,
  minimum: 1512, on_hand: 1200, lists_counted: 2, is_low: true, alert_enabled: true, ...extra,
});

function setup({ levels = [level()], counted = true } = {}) {
  state.fake = createFakeSupabase({
    tables: {
      employee_groups: (call) => (call.op === "select" && String(call.columns).includes("low_stock_alert")
        ? [{ id: "g1", low_stock_alert: counted }, { id: "g2", low_stock_alert: false }]
        : [
          { id: "g1", name: "Entrepôt Alma", note: null, employee_group_members: [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }] },
          { id: "g2", name: "Entrepôt Beloeil", note: null, employee_group_members: [{ user_id: "d" }] },
        ]),
      inventory_items: [{ code: "EQ000009", name: "Gradateur mural" }],
      inventory_min_ratios: (call) => (call.op === "select" ? [] : null),
    },
    rpcs: { inventory_stock_levels: levels.map((row) => ({ ...row, alert_enabled: counted && row.alert_enabled })) },
  });
  return render(<MemoryRouter><InventoryMinimums /></MemoryRouter>);
}

afterEach(cleanup);

describe("InventoryMinimums", () => {
  it("lists every warehouse with a Oui / Non", async () => {
    setup();
    await screen.findAllByText("Entrepôt Alma");
    expect(screen.getByText("Entrepôt Beloeil")).toBeTruthy();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
  });

  it("shows the minimum next to the employees' total for a counted warehouse, the low one marked", async () => {
    setup();
    await screen.findAllByText("Thermostat intelligent Hilo 4000");
    expect(screen.getByText(fr("mgr.inventory.ratios.lowBadge", { count: 1 }))).toBeTruthy();
    expect(screen.getByText(fr("mgr.inventory.ratios.total"))).toBeTruthy();
    const row = screen.getAllByText("EQ000016").map((el) => el.closest("tr")).find(Boolean);
    expect(row.textContent).toMatch(/1\s?512/); // minimum = 504 × 3
    expect(row.textContent).toMatch(/1\s?200/); // total of the employees' inventories
  });

  it("lists at the top the devices below their minimum, with their stock", async () => {
    setup();
    await screen.findAllByText("Thermostat intelligent Hilo 4000");
    expect(screen.getByText(fr("mgr.inventory.ratios.lowTitle", { count: 1 }))).toBeTruthy();
    const normalize = (text) => text.replace(/\s/g, " ");
    expect(screen.getByText(normalize(fr("mgr.inventory.ratios.lowLine", { onHand: "1 200", minimum: "1 512" })), { normalizer: normalize })).toBeTruthy();
  });

  it("goes no further for a warehouse that is not counted", async () => {
    setup({ counted: false });
    await screen.findByText("Entrepôt Alma");
    expect(screen.queryByText(fr("mgr.inventory.ratios.lowTitle", { count: 1 }))).toBeNull(); // not counted: no alert
    expect(screen.queryByText("Thermostat intelligent Hilo 4000")).toBeNull();
    expect(screen.queryByLabelText(fr("mgr.inventory.ratios.perEmployee"))).toBeNull();
  });

  it("counts a warehouse when Oui is picked", async () => {
    setup({ counted: false, levels: [] });
    await screen.findByText("Entrepôt Beloeil");
    const beloeil = screen.getByRole("radiogroup", { name: new RegExp("Entrepôt Beloeil") });
    fireEvent.click(within(beloeil).getByRole("radio", { name: fr("common.yes") }));
    await waitFor(() => expect(state.fake.calls.some((call) => call.table === "employee_groups" && call.op === "update")).toBe(true));
    const update = state.fake.calls.find((call) => call.table === "employee_groups" && call.op === "update");
    expect(update.payload).toEqual({ low_stock_alert: true });
  });

  it("refuses a ratio of 0 and saves one typed with a comma", async () => {
    setup({ levels: [] });
    await screen.findByText(fr("mgr.inventory.ratios.none"));
    const item = screen.getByLabelText(fr("mgr.inventory.colItem"));
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
