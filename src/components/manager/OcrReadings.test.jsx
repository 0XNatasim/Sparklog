// @vitest-environment jsdom
// À traiter › OCR: one line per proof screenshot, the reader's values next to the work order's, differences marked.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));

const { default: OcrReadings } = await import("./OcrReadings");
const rpcCalls = [];

const evidence = (id, extra) => ({ id, job_id: "j1", user_id: "u1", job_date: "2026-11-16", created_at: "2026-11-16T22:00:00Z", storage_path: `u1/2026-11-16/${id}.jpg`, ocr_status: "processed", proof_read_at: "2026-11-16T22:01:00Z", ...extra });

function setup(rows, { sendBack = true, britton = [] } = {}) {
  h.fake = createFakeSupabase({
    tables: {
      overtime_settings: [{ id: true, send_back_enabled: sendBack }],
      overtime_evidence: rows,
      britton_overtime: britton,
      profiles: [{ id: "u1", full_name: "Alex Test", first_trip_unpaid: false, ten_hour_days: false }],
      jobs: [{ id: "j1", user_id: "u1", job_date: "2026-11-16", updated_at: "2026-11-16T22:00:00Z", status: "submitted", ot: "208637", depart: "06:30", arrivee: "07:00", fin: "17:00", return_time_minutes: 0 }],
    },
  });
  h.fake.client.rpc = async (name, args) => { rpcCalls.push([name, args]); return { data: 1, error: null }; };
  h.fake.client.storage = { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://files.test/proof.jpg" }, error: null }) }) };
  render(<MemoryRouter><OcrReadings /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OcrReadings", () => {
  it("shows what was read next to what the work order expects, and marks the differences", async () => {
    setup([
      evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      evidence("p2", { proof_ot: "111111", proof_client_minutes: 150, proof_return_minutes: 0, created_at: "2026-11-16T21:00:00Z" }),
    ]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2));
    expect(screen.getByText("OT-111111").className).toContain("text-destructive"); // the OT read on the proof differs from the sheet's
    expect(screen.getAllByText("OT-208637").length).toBe(1); // the OT read on the first proof (the sheet's own OT is a button)
    expect(screen.getAllByText("208637").length).toBeGreaterThanOrEqual(2); // the work order's OT, twice
    expect(screen.getAllByText("150 min").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conforme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Écart / fiche").length).toBeGreaterThan(0);
  });

  it("hides the older proofs (never read) until asked, and filters the readings to check", async () => {
    setup([
      evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      evidence("old", { proof_read_at: null }),
      evidence("blank", {}),
    ]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Afficher"), { target: { value: "check" } });
    expect(screen.getAllByText("Alex Test")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Afficher"), { target: { value: "all" } });
    expect(screen.getAllByText("Alex Test")).toHaveLength(3);
  });
});

describe("OcrReadings › depuis le 16 novembre", () => {
  it("reads only the proofs of work dates from 2026-11-16", async () => {
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    const call = h.fake.calls.find((c) => c.table === "overtime_evidence");
    expect(call.filters).toContainEqual(["gte", "job_date", "2026-11-16"]);
  });
});

describe("OcrReadings › Relire", () => {
  it("shows a failed reading apart from an unreadable picture and puts the failed proofs back in the queue with one call", async () => {
    setup([evidence("bad", { ocr_status: "failed" }), evidence("wait", { ocr_status: "pending", proof_read_at: null }), evidence("ok1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })]);
    rpcCalls.length = 0;
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2)); // « all readings »: the queued one is not a reading yet
    expect(screen.getAllByText("Lecture échouée").length).toBeGreaterThan(0);
    expect(screen.getByText(/En file : 1/)).toBeTruthy(); // the counter counts the queued proof
    fireEvent.click(screen.getByRole("button", { name: "Remettre les échecs en file (1)" }));
    await waitFor(() => expect(rpcCalls).toEqual([["requeue_overtime_proofs", { p_ids: ["bad"] }]]));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 preuve(s) remise(s) dans la file"));
  });
});

describe("OcrReadings › aperçu et liens", () => {
  it("shows the screenshot next to its work order, with the gaps in red", async () => {
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 99, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Voir la capture" }));
    await waitFor(() => expect(screen.getByText(/Capture et fiche de travail · OT 208637/)).toBeTruthy());
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://files.test/proof.jpg");
    expect(screen.getByText("06:30 → 07:00 → 17:00")).toBeTruthy();
    expect(screen.getByText(/99 min \//).className).toContain("text-destructive");
  });

  it("makes the employee name and the OT clickable", async () => {
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Alex Test" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "208637" })).toBeTruthy();
  });
});

describe("OcrReadings › tout relire", () => {
  it("offers « Relire » on a reading that already has values, and a button to read every shown reading again", async () => {
    rpcCalls.length = 0;
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Relire" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tout relire (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirmer|Oui|OK/i }));
    await waitFor(() => expect(rpcCalls).toEqual([["requeue_overtime_proofs", { p_ids: ["p1"] }]]));
  });
});

describe("OcrReadings › renvoyer pour correction", () => {
  it("gives a submitted job back to the employee after a confirmation, with the state the job was read in", async () => {
    rpcCalls.length = 0;
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 99, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer pour correction" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirmer|Oui|OK/i }));
    await waitFor(() => expect(rpcCalls).toEqual([["return_job_for_correction", { p_job_id: "j1", p_expected_updated_at: "2026-11-16T22:00:00Z" }]]));
  });
});

describe("OcrReadings › interrupteur du retour pour correction", () => {
  it("hides the send-back button while the switch is off in Configuration", async () => {
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })], { sendBack: false });
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Renvoyer pour correction" })).toBeNull();
  });
});

describe("OcrReadings › filtre par jour", () => {
  it("offers a day filter with the days present and narrows the table to the chosen day", async () => {
    setup([
      evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      evidence("p2", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0, job_date: "2026-11-17", created_at: "2026-11-17T22:00:00Z" }),
    ]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Jour"), { target: { value: "2026-11-17" } });
    expect(screen.getAllByText("Alex Test")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Jour"), { target: { value: "" } });
    expect(screen.getAllByText("Alex Test")).toHaveLength(2);
  });

  it("does not compare with Britton in the per-proof view: only proof and Sparklog timesheet (migration 0156)", async () => {
    const line = (id, extra) => ({ id, job_date: "2026-11-16", ot: "208637", employee_name: "Alex Test", name_key: "alex test", client_minutes: 150, return_minutes: 0, total_minutes: 150, note: null, ...extra });
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })], { britton: [line("b1", { client_minutes: 60 }), line("b2", { ot: "424242", employee_name: "Autre", name_key: "autre" })] });
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    // two-line header: OT / « Chez le client » / « Retour » over Preuve de temps · Fiche de travail
    expect(screen.getByRole("columnheader", { name: "Chez le client" }).colSpan).toBe(2);
    expect(screen.getByRole("columnheader", { name: "Retour" }).colSpan).toBe(2);
    expect(screen.getByRole("columnheader", { name: "OT" }).colSpan).toBe(2);
    expect(screen.queryByRole("columnheader", { name: "Britton" })).toBeNull();
    expect(screen.queryByText("60 min")).toBeNull(); // Britton's 60 is not shown here
    expect(screen.getByText("Britton sans preuve (1)")).toBeTruthy(); // the line of OT 424242 has no proof
    expect(screen.queryByRole("option", { name: /Écart avec Britton/ })).toBeNull();
  });

  it("puts the two captures of one work order in one box, numbered 1 and 2", async () => {
    setup([
      evidence("p1", { proof_client_minutes: 150, created_at: "2026-11-16T22:00:00Z" }),
      evidence("p2", { proof_return_minutes: 0, created_at: "2026-11-16T22:05:00Z" }),
    ]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2));
    expect(screen.getByLabelText("Capture 1 sur 2").textContent).toBe("1");
    expect(screen.getByLabelText("Capture 2 sur 2").textContent).toBe("2");
    expect(document.querySelectorAll("tbody")).toHaveLength(1); // one box for the job
  });

  it("shows no Britton column while nothing was imported", async () => {
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    expect(screen.queryByRole("columnheader", { name: "Britton" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Chez le client" }).colSpan).toBe(2); // proof · work sheet only
    expect(screen.getByText("Importer Britton")).toBeTruthy();
  });

  it("switches to the per-OT comparison (Britton · Proof · Sheet) once a Britton table was imported", async () => {
    const britton = [{ id: "b1", job_date: "2026-11-16", ot: "208637", employee_name: "Alex Test", name_key: "alex test", client_minutes: 150, return_minutes: 0, total_minutes: 150, note: null }];
    setup([evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 })], { britton });
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Par OT (Britton · Preuve · Fiche)" }));
    expect(await screen.findByText("Temps supplémentaire comparé : Britton · Preuve de temps · Fiche de travail")).toBeTruthy();
    expect(screen.queryByLabelText("Afficher")?.tagName).not.toBe(undefined); // the comparison has its own filter
    fireEvent.click(screen.getByRole("button", { name: "Par preuve" }));
    expect(await screen.findByText("Conforme")).toBeTruthy();
  });
});
