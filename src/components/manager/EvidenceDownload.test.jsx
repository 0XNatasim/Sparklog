// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const loadEvidenceCatalog = vi.fn();
const downloadEvidenceZip = vi.fn();
vi.mock("@/lib/evidence-download", async () => {
  const actual = await vi.importActual("@/lib/evidence-download");
  return { ...actual, loadEvidenceCatalog: (...args) => loadEvidenceCatalog(...args), downloadEvidenceZip: (...args) => downloadEvidenceZip(...args) };
});
import EvidenceDownload from "./EvidenceDownload";
import { fileKey } from "@/lib/evidence-download";

const file = (path, date = "2026-10-28") => ({ bucket: "overtime-evidence", path, kind: "overtime", date, userId: "u1", employee: "Alex Test", ot: "190403", index: 1, count: 1 });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("EvidenceDownload", () => {
  it("counts the new and the already downloaded pictures, and downloads only the new ones", async () => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg", "2026-10-29")];
    loadEvidenceCatalog.mockResolvedValue({ files, done: new Set([fileKey(files[0])]) });
    downloadEvidenceZip.mockResolvedValue({ saved: 2, skipped: 0, remaining: 0 });
    render(<EvidenceDownload />);
    fireEvent.click(screen.getByRole("button", { name: /Télécharger les justificatifs/ }));
    await screen.findByText(/2 nouveaux · 1 déjà téléchargés · 2 dans le ZIP/);
    fireEvent.click(screen.getByRole("button", { name: /Télécharger le ZIP/ }));
    await waitFor(() => expect(downloadEvidenceZip).toHaveBeenCalled());
    expect(downloadEvidenceZip.mock.calls[0][1].map((f) => f.path)).toEqual(["b.jpg", "c.jpg"]);
    await screen.findByText(/2 photo\(s\) téléchargée\(s\)/);
  });

  it("limits the download to a range of weeks", async () => {
    const files = [file("a.jpg", "2026-10-20"), file("b.jpg", "2026-10-28"), file("c.jpg", "2026-11-03")];
    loadEvidenceCatalog.mockResolvedValue({ files, done: new Set() });
    render(<EvidenceDownload />);
    fireEvent.click(screen.getByRole("button", { name: /Télécharger les justificatifs/ }));
    await screen.findByText(/3 nouveaux · 0 déjà téléchargés · 3 dans le ZIP/);
    fireEvent.change(screen.getByLabelText(/De la semaine/), { target: { value: "2026-10-25" } });
    fireEvent.change(screen.getByLabelText(/À la semaine/), { target: { value: "2026-10-25" } });
    await screen.findByText(/1 nouveaux · 0 déjà téléchargés · 1 dans le ZIP/);
  });

  it("offers the ones already downloaded again when asked", async () => {
    const files = [file("a.jpg"), file("b.jpg")];
    loadEvidenceCatalog.mockResolvedValue({ files, done: new Set(files.map(fileKey)) });
    render(<EvidenceDownload />);
    fireEvent.click(screen.getByRole("button", { name: /Télécharger les justificatifs/ }));
    await screen.findByText(/0 nouveaux · 2 déjà téléchargés · 0 dans le ZIP/);
    expect(screen.getByRole("button", { name: /Télécharger le ZIP/ }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Inclure ceux déjà téléchargés/));
    await screen.findByText(/2 dans le ZIP/);
    expect(screen.getByRole("button", { name: /Télécharger le ZIP/ }).disabled).toBe(false);
  });
});
