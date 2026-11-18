// @vitest-environment jsdom
// À traiter › OCR: one line per proof screenshot, the reader's values next to the work order's, differences marked.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));

const { default: OcrReadings } = await import("./OcrReadings");

const evidence = (id, extra) => ({ id, job_id: "j1", user_id: "u1", job_date: "2026-11-16", created_at: "2026-11-16T22:00:00Z", storage_path: `u1/2026-11-16/${id}.jpg`, ocr_status: "processed", proof_read_at: "2026-11-16T22:01:00Z", ...extra });

function setup(rows) {
  h.fake = createFakeSupabase({
    tables: {
      overtime_evidence: rows,
      profiles: [{ id: "u1", full_name: "Alex Test", first_trip_unpaid: false, ten_hour_days: false }],
      jobs: [{ id: "j1", user_id: "u1", job_date: "2026-11-16", status: "submitted", ot: "208637", depart: "06:30", fin: "17:00", return_time_minutes: 0 }],
    },
  });
  render(<OcrReadings />);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OcrReadings", () => {
  it("shows what was read next to what the work order expects, and marks the differences", async () => {
    setup([
      evidence("p1", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      evidence("p2", { proof_ot: "111111", proof_client_minutes: 150, proof_return_minutes: 0, created_at: "2026-11-16T21:00:00Z" }),
    ]);
    await waitFor(() => expect(screen.getAllByText("Alex Test")).toHaveLength(2));
    expect(screen.getByText("111111").className).toContain("text-destructive");
    expect(screen.getAllByText("208637").length).toBeGreaterThanOrEqual(3); // the work order's OT (twice) and the OT read on the first proof
    expect(screen.getAllByText("150 min").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conforme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Écart").length).toBeGreaterThan(0);
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
