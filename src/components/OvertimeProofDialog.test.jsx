// @vitest-environment jsdom
// History › the overtime proof of one work order (migration 0144): shown from the job, replaced / removed / added while the sheet is
// editable, read-only once it is submitted.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null, confirm: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [h.confirm, null] }));
vi.mock("@/lib/overtime-proofs", async (importOriginal) => ({ ...(await importOriginal()), saveOwnProof: h.save, removeOwnProof: h.remove, signedProofUrls: async () => new Map([["u/d/p1.jpg", "https://signed/p1"]]) }));

const { default: OvertimeProofDialog } = await import("./OvertimeProofDialog");
const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const job = { id: "j2", ot: "200452", job_date: "2026-11-18", status: "saved", locked: false };

function setup(proofs, props = {}) {
  h.fake = createFakeSupabase({ rpcs: { my_overtime_proofs: proofs } });
  const onChanged = vi.fn();
  render(<OvertimeProofDialog job={job} userId="u" editable dailyMinutes={540} onClose={() => {}} onChanged={onChanged} {...props} />);
  return { onChanged };
}

beforeEach(() => { h.save.mockResolvedValue("new"); h.remove.mockResolvedValue(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OvertimeProofDialog", () => {
  it("is short: the how-to with the two example captures (no long rule, no old example image)", async () => {
    setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }]);
    expect(await screen.findByText("On doit voir les 2 photos comme celles-ci :")).toBeTruthy();
    expect(screen.getByText("Question 3 : le temps de retour, si applicable")).toBeTruthy();
    expect(screen.getByAltText(/Exemple de capture 1/).getAttribute("src")).toBe("/overtime-example-1.webp");
    expect(screen.getByAltText(/Exemple de capture 2/).getAttribute("src")).toBe("/overtime-example-2.webp");
    expect(screen.queryByText(/chaque OT qui dépasse/)).toBeNull();
    expect(screen.queryByAltText(fr("form.evidence.exampleAlt"))).toBeNull();
  });

  it("does not show the how-to on a submitted (read-only) job, only the lock message", async () => {
    setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }], { editable: false });
    await screen.findByAltText(fr("proofs.pictureAlt", { n: 1 }));
    expect(screen.queryByText("On doit voir les 2 photos comme celles-ci :")).toBeNull();
    expect(screen.getByText(fr("proofs.locked"))).toBeTruthy();
  });

  it("lets the employee add a second capture while the job holds only one", async () => {
    setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }]);
    expect(await screen.findByRole("button", { name: fr("proofs.add") })).toBeTruthy();
  });

  it("shows only the proof of THIS work order", async () => {
    setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }, { id: "p9", job_id: "j3", storage_path: "u/d/p9.jpg" }]);
    const image = await screen.findByAltText(fr("proofs.pictureAlt", { n: 1 }));
    expect(image.getAttribute("src")).toBe("https://signed/p1");
    expect(screen.queryByAltText(fr("proofs.pictureAlt", { n: 2 }))).toBeNull();
  });

  it("replaces the proof of the job, naming the one it replaces", async () => {
    const { onChanged } = setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }]);
    fireEvent.click(await screen.findByRole("button", { name: fr("proofs.replace") }));
    const file = new File(["x"], "capture.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(fr("proofs.add")), { target: { files: [file] } });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][1]).toMatchObject({ userId: "u", job: { id: "j2" }, oldProofId: "p1", dailyMinutes: 540 });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("removes the proof only after the confirmation", async () => {
    h.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { onChanged } = setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }]);
    fireEvent.click(await screen.findByRole("button", { name: fr("proofs.remove") }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(h.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: fr("proofs.remove") }));
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith(expect.anything(), "p1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("offers « Ajouter la capture » when the job has no proof, and adds it (no old proof)", async () => {
    setup([]);
    fireEvent.click(await screen.findByRole("button", { name: fr("proofs.add") }));
    fireEvent.change(screen.getByLabelText(fr("proofs.add"), { selector: "input" }), { target: { files: [new File(["x"], "c.png", { type: "image/png" })] } });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][1].oldProofId).toBeNull();
  });

  it("is read-only once the sheet is submitted: no replace, remove or add", async () => {
    setup([{ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg" }], { editable: false });
    await screen.findByAltText(fr("proofs.pictureAlt", { n: 1 }));
    expect(screen.queryByRole("button", { name: fr("proofs.replace") })).toBeNull();
    expect(screen.queryByRole("button", { name: fr("proofs.remove") })).toBeNull();
    expect(screen.getByText(fr("proofs.locked"))).toBeTruthy();
  });
});
