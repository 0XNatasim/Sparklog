// @vitest-environment jsdom
// Gestion › Configuration › OT prédéfinis (0124): add, refuse a duplicate or a number, hide, move.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [async () => true, null] }));

const { default: PresetWorkOrdersManager } = await import("./PresetWorkOrdersManager");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const rows = [
  { id: "a", label: "PAUSE SÉCURITÉ", sort_order: 10, active: true },
  { id: "b", label: "OK KARINE", sort_order: 20, active: true },
];
const calls = (op) => state.fake.calls.filter((call) => call.table === "preset_work_orders" && call.op === op);

function setup() {
  state.fake = createFakeSupabase({ tables: { preset_work_orders: (call) => (call.op === "select" ? rows : null) } });
  return render(<PresetWorkOrdersManager />);
}

afterEach(cleanup);

describe("PresetWorkOrdersManager", () => {
  it("lists the labels and adds a new one in capitals, after the last", async () => {
    setup();
    await screen.findByText("OK KARINE");
    fireEvent.change(screen.getByLabelText(fr("presetOt.newLabel")), { target: { value: "formation hq" } });
    fireEvent.click(screen.getByRole("button", { name: fr("presetOt.add") }));
    await waitFor(() => expect(calls("insert")).toHaveLength(1));
    expect(calls("insert")[0].payload).toEqual({ label: "FORMATION HQ", sort_order: 30 });
  });

  it("refuses a label already in the list and a real OT number, without writing", async () => {
    setup();
    await screen.findByText("OK KARINE");
    const input = screen.getByLabelText(fr("presetOt.newLabel"));
    fireEvent.change(input, { target: { value: "ok karine" } });
    fireEvent.click(screen.getByRole("button", { name: fr("presetOt.add") }));
    expect(await screen.findByText(fr("presetOt.errors.taken"))).toBeTruthy();
    fireEvent.change(input, { target: { value: "190403" } });
    fireEvent.click(screen.getByRole("button", { name: fr("presetOt.add") }));
    expect(await screen.findByText(fr("presetOt.errors.invalid", { max: 60 }))).toBeTruthy();
    expect(calls("insert")).toHaveLength(0);
  });

  it("hides a label from the drop-down without deleting it", async () => {
    setup();
    await screen.findByText("OK KARINE");
    fireEvent.click(screen.getAllByRole("button", { name: fr("presetOt.hide") })[1]);
    await waitFor(() => expect(calls("update")).toHaveLength(1));
    expect(calls("update")[0].payload).toEqual({ active: false });
    expect(calls("delete")).toHaveLength(0);
  });

  it("moves a label up by renumbering", async () => {
    setup();
    await screen.findByText("OK KARINE");
    fireEvent.click(screen.getAllByRole("button", { name: fr("presetOt.up") })[1]);
    await waitFor(() => expect(calls("update")).toHaveLength(2));
    expect(calls("update").map((call) => call.payload)).toEqual([{ sort_order: 10 }, { sort_order: 20 }]);
  });
});
