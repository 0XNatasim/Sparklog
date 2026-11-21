// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

vi.mock("@/lib/evidence-file", () => ({ readPickedFile: async (file) => file, prepareEvidenceImage: async (file) => file }));
const { default: MinuteEditPanel } = await import("./MinuteEditPanel");

const people = [{ id: "e1", full_name: "Employé Test" }];
const job = { id: "j1", ot: "208637", depart: "06:57:00", arrivee: "07:20:00", fin: "15:00:00", status: "submitted", return_time_minutes: 0, job_date: "2026-11-20" };

function setup(enabled, proofs = []) {
  state.fake = createFakeSupabase({
    tables: { overtime_settings: [{ id: true, minute_edit_enabled: enabled }], jobs: [{ ...job, user_id: "e1" }], overtime_evidence: proofs },
    rpcs: { adjust_job_times_for_employee: { ...job, depart: "07:00:00" }, set_minute_edit_enabled: true, add_overtime_proof_for_employee: "p1" },
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

  it("deletes a sheet with a reason, after a confirmation", async () => {
    setup(true);
    await screen.findByText("Désactiver");
    fireEvent.change(screen.getByLabelText("Employé"), { target: { value: "e1" } });
    await screen.findByLabelText("Départ");
    const remove = screen.getByText("Supprimer la fiche").closest("button");
    expect(remove.disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByLabelText("Raison (gardée au Journal)"), { target: { value: "fiche en double" } });
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    fireEvent.click(await screen.findByRole("button", { name: /confirmer|oui|ok/i }));
    await waitFor(() => expect(state.fake.calls.some((call) => call.rpc === "delete_job_for_employee")).toBe(true));
    expect(state.fake.calls.find((call) => call.rpc === "delete_job_for_employee").args).toEqual({ p_job_id: "j1", p_reason: "fiche en double" });
  });

  it("says when a sheet has no proof and adds one for the employee with a reason", async () => {
    setup(true);
    await screen.findByText("Désactiver");
    fireEvent.change(screen.getByLabelText("Employé"), { target: { value: "e1" } });
    await screen.findByText("Aucune preuve de temps supp. sur cette fiche");
    const add = screen.getByText("Ajouter la preuve").closest("button");
    expect(add.disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByLabelText("Raison (gardée au Journal)"), { target: { value: "3 minutes de temps supp." } });
    expect(add.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Image de la preuve de temps supp."), { target: { files: [new File(["x"], "preuve.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByRole("button", { name: /confirmer|oui|ok/i }));
    await waitFor(() => expect(state.fake.calls.some((call) => call.rpc === "add_overtime_proof_for_employee")).toBe(true));
    const call = state.fake.calls.find((entry) => entry.rpc === "add_overtime_proof_for_employee");
    expect(call.args).toMatchObject({ p_job_id: "j1", p_reason: "3 minutes de temps supp." });
    expect(call.args.p_storage_path).toMatch(/^e1\/2026-11-20\/.+\.jpg$/);
  });

  it("shows the proofs already attached", async () => {
    setup(true, [{ id: "p1", job_id: "j1", ocr_status: "pending", not_needed_at: null }]);
    await screen.findByText("Désactiver");
    fireEvent.change(screen.getByLabelText("Employé"), { target: { value: "e1" } });
    expect(await screen.findByText("Preuve de temps supp. : 1 jointe(s)")).toBeTruthy();
  });
});
