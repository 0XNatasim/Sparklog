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
    // « Temps supplémentaire pour quel OT ? » comes before the file picker (the form has no OT question any more)
    fireEvent.change(screen.getByLabelText(fr("form.evidence.askOt")), { target: { value: "200452" } });
    fireEvent.click(screen.getByRole("button", { name: fr("form.evidence.askOtContinue") }));
    const file = new File(["x"], "capture.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(fr("proofs.add"), { selector: "input" }), { target: { files: [file] } });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][1]).toMatchObject({ userId: "u", job: { id: "j2" }, oldProofId: "p1", dailyMinutes: 540, declaredOt: "200452" });
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
    fireEvent.change(screen.getByLabelText(fr("form.evidence.askOt")), { target: { value: "200452" } });
    fireEvent.click(screen.getByRole("button", { name: fr("form.evidence.askOtContinue") }));
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

  describe("reading of the new captures (returned sheet)", () => {
    const returned = { id: "j2", ot: "200452", job_date: "2026-11-18", status: "updated", locked: false, depart: "06:00", fin: "16:00", return_time_minutes: 0 };
    const read = (extra = {}) => ({ id: "p1", job_id: "j2", storage_path: "u/d/p1.jpg", ocr_status: "processed", form_kind: "new", proof_ot: "200452", proof_client_minutes: 120, proof_return_minutes: 0, proof_read_at: "2026-11-26T15:00:00Z", ...extra });
    const withJob = (proofs, onResubmit = vi.fn()) => {
      h.fake = createFakeSupabase({ rpcs: { my_overtime_proofs: proofs } });
      render(<OvertimeProofDialog job={returned} userId="u" editable dayJobs={[returned]} onResubmit={onResubmit} onClose={() => {}} onChanged={() => {}} />);
      return onResubmit;
    };

    it("says it is reading while a capture waits in the queue, with no submit button yet", async () => {
      withJob([read({ ocr_status: "pending", proof_read_at: null, proof_client_minutes: null, proof_return_minutes: null })]);
      expect(await screen.findAllByText(fr("proofs.check.reading"))).not.toHaveLength(0);
      expect(screen.queryByRole("button", { name: fr("proofs.resubmit") })).toBeNull();
    });

    it("offers « Soumettre de nouveau » once every capture matches the sheet", async () => {
      const onResubmit = withJob([read()]);
      expect(await screen.findByText(fr("proofs.check.ok"))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: fr("proofs.resubmit") }));
      expect(onResubmit).toHaveBeenCalledTimes(1);
    });

    it("keeps the button away and names the problem when the minutes differ", async () => {
      withJob([read({ proof_client_minutes: 45 })]);
      expect(await screen.findByText(fr("proofs.check.bad"))).toBeTruthy();
      expect(screen.getByText(fr("proofs.check.state.mismatch"))).toBeTruthy();
      expect(screen.queryByRole("button", { name: fr("proofs.resubmit") })).toBeNull();
    });
  });
});
