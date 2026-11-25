// @vitest-environment jsdom
// À traiter › OCR › Télécharger: a whole week or one single day.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));

const { default: OcrDownload } = await import("./OcrDownload");

const row = (id, jobDate) => ({ id, storagePath: `u1/${jobDate}/${id}.jpg`, jobDate, userId: "u1", name: "Alex Test", jobOt: "208637" });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OcrDownload", () => {
  it("offers every day of the week and counts only that day when one is picked", async () => {
    h.fake = createFakeSupabase({ tables: { evidence_downloads: [] } });
    // 2026-11-16 (Monday) and 2026-11-17 are in the same Sunday → Saturday week
    render(<OcrDownload rows={[row("p1", "2026-11-16"), row("p2", "2026-11-16"), row("p3", "2026-11-17")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Télécharger" }));
    await waitFor(() => expect(screen.getByText(/3 nouveau/)).toBeTruthy()); // the whole week
    const daySelect = screen.getByLabelText("Jour");
    expect([...daySelect.options].map((option) => option.value)).toEqual(["", "2026-11-17", "2026-11-16"]);
    fireEvent.change(daySelect, { target: { value: "2026-11-16" } });
    expect(screen.getByText(/2 nouveau/)).toBeTruthy();
    fireEvent.change(daySelect, { target: { value: "" } });
    expect(screen.getByText(/3 nouveau/)).toBeTruthy();
  });
});
