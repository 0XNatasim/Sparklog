// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: MinuteEditPanel } = await import("./MinuteEditPanel");

const people = [{ id: "e1", full_name: "Employé Test" }];
const job = { id: "j1", ot: "208637", depart: "06:57:00", arrivee: "07:20:00", fin: "15:00:00", status: "submitted", return_time_minutes: 0, job_date: "2026-11-20" };

function setup(enabled) {
  state.fake = createFakeSupabase({
    tables: { overtime_settings: [{ id: true, minute_edit_enabled: enabled }], jobs: [job] },
    rpcs: { adjust_job_times_for_employee: { ...job, depart: "07:00:00" }, set_minute_edit_enabled: true },
  });
  return render(<MinuteEditPanel people={people} />);
}
afterEach(() => cleanup());

describe("MinuteEditPanel", () => {
  it("offers only the switch while the option is off", async () => {
    setup(false);
    expect(await screen.findByText("Activer")).toBeTruthy();
    expect(screen.queryByLabelText("Raison (gardée au Journal)")).toBeNull();
  });

  it("moves the times of a sheet with a reason once the option is on", async () => {
    setup(true);
    await screen.findByText("Désactiver");
    fireEvent.change(screen.getByLabelText("Employé"), { target: { value: "e1" } });
    const start = await screen.findByLabelText("Départ");
    fireEvent.change(start, { target: { value: "07:00" } });
    const save = screen.getByText("Enregistrer les nouvelles heures");
    expect(save.disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByLabelText("Raison (gardée au Journal)"), { target: { value: "3 minutes de temps supp." } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    fireEvent.click(await screen.findByRole("button", { name: /confirmer|oui|ok/i }));
    await waitFor(() => expect(state.fake.calls.some((call) => call.rpc === "adjust_job_times_for_employee")).toBe(true));
    const call = state.fake.calls.find((entry) => entry.rpc === "adjust_job_times_for_employee");
    expect(call.args).toMatchObject({ p_job_id: "j1", p_depart: "07:00", p_fin: "15:00", p_reason: "3 minutes de temps supp." });
  });
});
