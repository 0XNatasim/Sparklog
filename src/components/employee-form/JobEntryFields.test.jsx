// @vitest-environment jsdom
// The OT field of the time entry: a drop-down of pre-made work orders next to it (0124). Picking one writes
// its label as the OT; the list still works when it cannot be read.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: JobEntryFields } = await import("./JobEntryFields");

const fr = (key) => dictionaries.fr[key];
const t = (key) => dictionaries.fr[key] ?? key;
const values = (ot) => ({ job_date: "2026-10-30", ot, depart: "", arrivee: "", fin: "", km_aller: "" });

function setup({ ot = "", tables = {} } = {}) {
  state.fake = createFakeSupabase({ tables });
  const onChange = vi.fn();
  render(<JobEntryFields t={t} values={values(ot)} onChange={onChange} disabled={false} officeEmployee={false} hoursLabel="0h00" parking={{ enabled: false }} />);
  return onChange;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("JobEntryFields pre-made OT", () => {
  const arrow = () => screen.getByRole("button", { name: fr("form.otPreset") });
  const labels = () => screen.getAllByRole("option").map((o) => o.textContent);

  it("opens the labels of the list from the arrow of the OT box and writes the one picked", async () => {
    const onChange = setup({ tables: { preset_work_orders: [{ label: "PAUSE SÉCURITÉ" }, { label: "FORMATION BRITTON" }] } });
    await waitFor(() => expect(arrow()).toBeTruthy());
    fireEvent.click(arrow());
    await waitFor(() => expect(labels()).toEqual(["PAUSE SÉCURITÉ", "FORMATION BRITTON"]));
    fireEvent.click(screen.getByText("FORMATION BRITTON"));
    expect(onChange).toHaveBeenCalledWith("ot", "FORMATION BRITTON");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the label when the OT typed is one of them, and none for a real number", async () => {
    setup({ ot: "ok karine", tables: { preset_work_orders: [{ label: "OK KARINE" }] } });
    fireEvent.click(arrow());
    await waitFor(() => expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("true"));
    cleanup();
    setup({ ot: "190403", tables: { preset_work_orders: [{ label: "OK KARINE" }] } });
    fireEvent.click(arrow());
    await waitFor(() => expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("false"));
  });

  it("keeps the five labels when the list cannot be read", async () => {
    setup({ tables: { preset_work_orders: () => ({ error: { message: "offline" } }) } });
    fireEvent.click(arrow());
    expect(labels()).toHaveLength(5);
  });

  it("types a number as before: the OT field is still free text", () => {
    const onChange = setup();
    fireEvent.change(document.getElementById("ot"), { target: { value: "190403" } });
    expect(onChange).toHaveBeenCalledWith("ot", "190403");
  });
});
