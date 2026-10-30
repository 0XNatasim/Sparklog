// @vitest-environment jsdom
// What the number on « Inventaire » means: the devices below their minimum, by warehouse.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const { default: InventoryLowStock } = await import("./InventoryLowStock");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const row = (group_name, code, item_name) => ({ group_id: group_name, group_name, code, item_name, on_hand: 12, minimum: 20 });
const rows = [row("Entrepôt Rimouski", "EQ000016", "Thermostat Hilo 4"), row("Entrepôt Rimouski", "EQ000017", "Passerelle Hilo"), row("Entrepôt Alma", "EQ000016", "Thermostat Hilo 4")];

afterEach(cleanup);

describe("InventoryLowStock", () => {
  it("says what the number is: one notification per warehouse, its low devices in red, with a link to the detail", () => {
    render(<MemoryRouter><InventoryLowStock rows={rows} /></MemoryRouter>);
    expect(screen.getByText(fr("mgr.inventory.ratios.lowTitle", { count: 2 }))).toBeTruthy();
    expect(screen.getByText("Entrepôt Rimouski")).toBeTruthy();
    expect(screen.getByText("Entrepôt Alma")).toBeTruthy();
    expect(screen.getByText(/Passerelle Hilo/).closest("li").className).toContain("text-destructive");
    expect(screen.getAllByText(fr("mgr.inventory.ratios.lowLine", { onHand: "12", minimum: "20" }))).toHaveLength(3);
    expect(screen.getByRole("link", { name: fr("mgr.inventory.ratios.seeDetail") }).getAttribute("href")).toBe("/manager/inventory/minimums");
  });

  it("has no link on the minimums page itself (detailed)", () => {
    render(<MemoryRouter><InventoryLowStock rows={rows} detailed /></MemoryRouter>);
    expect(screen.getByText(/Passerelle Hilo/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing when nothing is below its minimum", () => {
    const { container } = render(<MemoryRouter><InventoryLowStock rows={[]} /></MemoryRouter>);
    expect(container.textContent).toBe("");
  });
});
