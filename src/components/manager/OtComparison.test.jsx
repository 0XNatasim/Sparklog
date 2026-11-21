// @vitest-environment jsdom
// À traiter › OCR › « Par OT »: Britton, form and Sparklog side by side with one verdict.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));
const { default: OtComparison } = await import("./OtComparison");

const DAY = "2026-11-19";
const job = (id, userId, ot, extra = {}) => ({ id, user_id: userId, job_date: DAY, status: "submitted", ot, depart: "06:30", arrivee: "07:00", fin: "16:30", return_time_minutes: 0, ...extra });
const line = (id, name, ot, client, extra = {}) => ({ id, job_date: DAY, ot, employee_name: name, name_key: name.toLowerCase(), client_minutes: client, return_minutes: 0, total_minutes: client, note: null, ...extra });

function setup({ jobs, britton, proofRows = [], onView = () => {} }) {
  h.fake = createFakeSupabase({
    tables: {
      jobs,
      profiles: [{ id: "u1", full_name: "Alex Un", first_trip_unpaid: false, ten_hour_days: false }, { id: "u2", full_name: "Blaise Deux", first_trip_unpaid: false, ten_hour_days: false }],
    },
  });
  return render(<MemoryRouter><OtComparison britton={britton} proofRows={proofRows} onView={onView} /></MemoryRouter>);
}

afterEach(() => cleanup());

describe("OtComparison", () => {
  it("asks to import the Britton table first when there is none", async () => {
    setup({ jobs: [], britton: [] });
    expect(await screen.findByText(/Importe d'abord le tableau Britton/)).toBeTruthy();
  });

  it("shows a verdict per OT, only what needs checking by default, with the odd number in red", async () => {
    setup({
      jobs: [job("j1", "u1", "OT-111111"), job("j2", "u2", "OT-222222")],
      britton: [line("b1", "Alex Un", "111111", 120), line("b2", "Blaise Deux", "222222", 60), line("b3", "Personne Trois", "333333", 30)],
    });
    // j1: Britton 120 = timesheet 120 (no proof) -> « Sans preuve »; j2: Britton 60 vs 120 -> « Britton diffère »; b3: no work order -> « Pas dans Sparklog »
    expect(await screen.findByText("Blaise Deux")).toBeTruthy();
    expect(screen.getByText("Personne Trois")).toBeTruthy();
    expect(screen.getAllByText("Britton diffère").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pas dans Sparklog").length).toBeGreaterThan(0);
    const red = screen.getAllByText("60").find((node) => node.className.includes("text-destructive"));
    expect(red).toBeTruthy();
  });

  it("a Sparklog overtime with no Britton line is listed as not at Britton, and filtering narrows the list", async () => {
    setup({ jobs: [job("j1", "u1", "OT-111111"), job("j2", "u2", "OT-222222")], britton: [line("b1", "Alex Un", "111111", 120)] });
    await screen.findByText("Blaise Deux");
    expect(screen.getAllByText(/Pas chez Britton/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Afficher"), { target: { value: "all" } });
    expect(screen.getByText("Alex Un")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Chercher un employé, un OT ou une date"), { target: { value: "blaise" } });
    await waitFor(() => expect(screen.queryByText("Alex Un")).toBeNull());
  });

  it("opens the proof picture of a line that has one", async () => {
    const onView = vi.fn();
    const proof = { id: "p1", jobId: "j1", userId: "u1", name: "Alex Un", jobDate: DAY, jobOt: "OT-111111", state: "ok", storagePath: "u1/p1.jpg", createdAt: "2026-11-19T22:00:00Z", found: { ot: "111111", clientMinutes: 120, returnMinutes: 0 } };
    setup({ jobs: [job("j1", "u1", "OT-111111")], britton: [line("b1", "Alex Un", "111111", 120), line("b2", "Autre", "999999", 30)], proofRows: [proof], onView });
    fireEvent.change(await screen.findByLabelText("Afficher"), { target: { value: "ok" } });
    fireEvent.click(await screen.findByRole("button", { name: /voir/i }));
    expect(onView).toHaveBeenCalledWith(proof);
  });
});
