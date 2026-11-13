// @vitest-environment jsdom
// Gestion › Notes › Contremaître: a note shows the work sheet it follows; the manager can return the sheet, delete the note.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const fr = (key) => dictionaries.fr[key];
const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: ForemanReportsPanel } = await import("./ForemanReportsPanel");

const report = (extra = {}) => ({
  id: "r1", user_id: "f1", job_id: "j1", report_date: "2026-11-10", audited_name: "Paul Roy", body: "Casque oublié", created_at: "2026-11-10T20:00:00Z",
  job: { id: "j1", ot: "CONTREMAÎTRE", job_date: "2026-11-10", depart: "06:30:00", fin: "15:00:00", status: "submitted", updated_at: "2026-11-10T21:00:00Z" },
  ...extra,
});

function setup(reports) {
  state.fake = createFakeSupabase({ tables: { foreman_reports: reports, profiles: [{ id: "f1", full_name: "Éric Foreman" }] } });
  return render(<ForemanReportsPanel />);
}

afterEach(cleanup);

describe("ForemanReportsPanel", () => {
  it("shows the work sheet a note follows", async () => {
    setup([report()]);
    expect(await screen.findByText("Casque oublié")).toBeTruthy();
    expect(screen.getByText("CONTREMAÎTRE")).toBeTruthy();
    expect(screen.getByText("Éric Foreman")).toBeTruthy();
    expect(screen.getByRole("button", { name: fr("foremanNotes.export") })).toBeTruthy();
  });

  it("returns the work sheet for correction after a confirmation", async () => {
    setup([report()]);
    fireEvent.click(await screen.findByRole("button", { name: fr("foremanNotes.returnSheet") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(state.fake.rpcCalls("return_job_for_correction")).toHaveLength(1));
    expect(state.fake.rpcCalls("return_job_for_correction")[0].args).toEqual({ p_job_id: "j1", p_expected_updated_at: "2026-11-10T21:00:00Z" });
  });

  it("deletes the note alone, and offers no return for a sheet that is not submitted", async () => {
    setup([report({ job: { id: "j1", ot: "CONTREMAÎTRE", job_date: "2026-11-10", depart: "06:30:00", fin: "15:00:00", status: "updated" } })]);
    expect(await screen.findByText("Casque oublié")).toBeTruthy();
    expect(screen.queryByRole("button", { name: fr("foremanNotes.returnSheet") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: fr("foremanNotes.delete") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(state.fake.writes("foreman_reports").some((c) => c.op === "delete")).toBe(true));
  });
});
