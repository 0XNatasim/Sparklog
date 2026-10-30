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
  it("offers the labels of the list and writes the one picked as the OT", async () => {
    const onChange = setup({ tables: { preset_work_orders: [{ label: "PAUSE SÉCURITÉ" }, { label: "FORMATION BRITTON" }] } });
    const select = screen.getByLabelText(fr("form.otPreset"));
    await waitFor(() => expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual([fr("form.otPresetPlaceholder"), "PAUSE SÉCURITÉ", "FORMATION BRITTON"]));
    fireEvent.change(select, { target: { value: "FORMATION BRITTON" } });
    expect(onChange).toHaveBeenCalledWith("ot", "FORMATION BRITTON");
  });

  it("shows the label when the OT typed is one of them, and nothing for a real number", async () => {
    setup({ ot: "ok karine", tables: { preset_work_orders: [{ label: "OK KARINE" }] } });
    await waitFor(() => expect(screen.getByLabelText(fr("form.otPreset")).value).toBe("OK KARINE"));
    cleanup();
    setup({ ot: "190403", tables: { preset_work_orders: [{ label: "OK KARINE" }] } });
    await waitFor(() => expect(screen.getByLabelText(fr("form.otPreset")).value).toBe(""));
  });

  it("keeps the drop-down with the five labels when the list cannot be read", async () => {
    setup({ tables: { preset_work_orders: () => ({ error: { message: "offline" } }) } });
    const select = screen.getByLabelText(fr("form.otPreset"));
    expect(select.querySelectorAll("option")).toHaveLength(6); // placeholder + the five
    await waitFor(() => expect(select.querySelectorAll("option")).toHaveLength(6));
  });

  it("types a number as before: the OT field is still free text", () => {
    const onChange = setup();
    fireEvent.change(document.getElementById("ot"), { target: { value: "190403" } });
    expect(onChange).toHaveBeenCalledWith("ot", "190403");
  });
});
