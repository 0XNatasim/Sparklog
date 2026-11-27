// @vitest-environment jsdom
// The pictures of a saved note: thumbnails for everybody who can read the note, « add » and « remove » only for who may.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";

const h = vi.hoisted(() => ({ remove: vi.fn(), confirm: vi.fn() }));
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [h.confirm, null] }));
vi.mock("@/lib/note-files", async (importOriginal) => ({
  ...(await importOriginal()),
  signedNoteFileUrls: async (_client, paths) => new Map(paths.map((path) => [path, `https://signed/${path}`])),
  removeNoteFile: h.remove,
}));

const { default: NoteImages } = await import("./NoteImages");
const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const files = [{ id: "f1", path: "u/1.jpg" }, { id: "f2", path: "u/2.jpg" }];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("NoteImages", () => {
  it("shows the thumbnails as links to the full picture, with nothing to change for a reader", async () => {
    render(<NoteImages kind="foreman" noteId="n1" files={files} />);
    const image = await screen.findByAltText(fr("noteFiles.alt", { n: 1 }));
    await waitFor(() => expect(image.getAttribute("src")).toBe("https://signed/u/1.jpg"));
    expect(image.closest("a").getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("button", { name: /Retirer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: fr("noteFiles.add") })).toBeNull();
  });

  it("removes a picture only after the confirmation", async () => {
    h.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    h.remove.mockResolvedValue();
    const onRemoved = vi.fn();
    render(<NoteImages kind="manager" noteId="n1" userId="u" files={files} canRemove canAdd onRemoved={onRemoved} />);
    fireEvent.click(await screen.findByRole("button", { name: `${fr("noteFiles.remove")} 1` }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(h.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `${fr("noteFiles.remove")} 1` }));
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith(expect.anything(), files[0]));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(files[0]));
    expect(screen.getByRole("button", { name: fr("noteFiles.add") })).toBeTruthy();
  });

  it("offers nothing when the note has no picture and the viewer cannot add", () => {
    const { container } = render(<NoteImages kind="foreman" noteId="n1" files={[]} />);
    expect(container.textContent).toBe("");
  });
});
