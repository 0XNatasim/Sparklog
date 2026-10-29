// @vitest-environment jsdom
// Files of an accident file (0123): on a new file they wait to be sent; on a saved file they are sent at once,
// listed with their size, and removed after a confirmation.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";

const api = vi.hoisted(() => ({
  fetchAccidentFiles: vi.fn(),
  uploadAccidentFile: vi.fn(),
  removeAccidentFile: vi.fn(),
  signedAccidentFileUrls: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/ocr", () => ({ compressImage: vi.fn() }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [api.confirm, null] }));
vi.mock("@/lib/accident-files", async (importOriginal) => ({ ...(await importOriginal()), ...api }));

const { default: AccidentFiles } = await import("./AccidentFiles");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const pdf = (name) => new File(["x".repeat(2048)], name, { type: "application/pdf" });
const row = (id, name) => ({ id, accident_id: "acc", path: `acc/${id}.pdf`, name, kind: "document", mime_type: "application/pdf", size_bytes: 2048 });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AccidentFiles on a new file", () => {
  it("keeps the picked files in the list to send later, and drops one on demand", () => {
    const setPending = vi.fn();
    const { container } = render(<AccidentFiles accidentId={null} pending={[]} setPending={setPending} />);
    fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdf("certificat.pdf"), new File(["x"], "virus.exe")] } });
    expect(setPending).toHaveBeenCalledWith([expect.objectContaining({ name: "certificat.pdf" })]);
    expect(api.uploadAccidentFile).not.toHaveBeenCalled();
    expect(screen.getByText(fr("accidents.files.skipped", { count: 1 }))).toBeTruthy();
  });
});

describe("AccidentFiles on a saved file", () => {
  it("lists the files with their size and sends a new one at once", async () => {
    api.fetchAccidentFiles.mockResolvedValue([row("f1", "Rapport CNESST.pdf")]);
    api.signedAccidentFileUrls.mockResolvedValue(new Map([["acc/f1.pdf", "https://signed/f1"]]));
    api.uploadAccidentFile.mockResolvedValue(row("f2", "Photos.pdf"));
    const onCountChange = vi.fn();
    const { container } = render(<AccidentFiles accidentId="acc" pending={[]} setPending={() => {}} onCountChange={onCountChange} />);
    const link = await screen.findByText(/Rapport CNESST\.pdf/);
    expect(link.closest("a").getAttribute("href")).toBe("https://signed/f1");
    expect(screen.getByText("2 Ko")).toBeTruthy();

    fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdf("Photos.pdf")] } });
    await screen.findByText(/Photos\.pdf/);
    expect(api.uploadAccidentFile).toHaveBeenCalledWith("acc", expect.objectContaining({ name: "Photos.pdf" }));
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  it("removes a file only after the confirmation", async () => {
    api.fetchAccidentFiles.mockResolvedValue([row("f1", "Rapport.pdf")]);
    api.signedAccidentFileUrls.mockResolvedValue(new Map());
    api.removeAccidentFile.mockResolvedValue(undefined);
    const onCountChange = vi.fn();
    render(<AccidentFiles accidentId="acc" pending={[]} setPending={() => {}} onCountChange={onCountChange} />);
    await screen.findByText(/Rapport\.pdf/);

    api.confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: fr("accidents.files.remove") }));
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
    expect(api.removeAccidentFile).not.toHaveBeenCalled();

    api.confirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: fr("accidents.files.remove") }));
    await waitFor(() => expect(api.removeAccidentFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/Rapport\.pdf/)).toBeNull());
    expect(onCountChange).toHaveBeenCalledWith(-1);
  });

  it("says so when a file could not be sent, and keeps the others", async () => {
    api.fetchAccidentFiles.mockResolvedValue([]);
    api.signedAccidentFileUrls.mockResolvedValue(new Map());
    api.uploadAccidentFile.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(row("f2", "Bon.pdf"));
    const { container } = render(<AccidentFiles accidentId="acc" pending={[]} setPending={() => {}} />);
    await waitFor(() => expect(api.fetchAccidentFiles).toHaveBeenCalled());
    fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdf("Mauvais.pdf"), pdf("Bon.pdf")] } });
    await screen.findByText(/Bon\.pdf/);
    expect(screen.getByRole("alert").textContent.length).toBeGreaterThan(0);
  });
});
