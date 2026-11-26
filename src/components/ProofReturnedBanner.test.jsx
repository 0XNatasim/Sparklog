// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({ fake: null, role: "employee" }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return h.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, role: h.role }), SESSION_RESUMED_EVENT: "x" }));

const { default: ProofReturnedBanner } = await import("./ProofReturnedBanner");

const message = (jobId, extra = {}) => ({ broadcast_id: `b-${jobId}`, acknowledged_at: "2026-11-26T10:00:00Z", manager_broadcasts: { body: "x", created_at: "2026-11-26T09:00:00Z", attachments: [], kind: "proof_returned", meta: { job_id: jobId, ot: "202618" }, ...extra } });
function setup(messages, jobs, role = "employee") {
  h.role = role;
  h.fake = createFakeSupabase({ tables: { broadcast_recipients: messages, jobs } });
  render(<MemoryRouter><ProofReturnedBanner /></MemoryRouter>);
}
afterEach(cleanup);

describe("ProofReturnedBanner", () => {
  it("stays on every page while the returned job is not submitted again, even after the message was read (OK)", async () => {
    setup([message("j1")], [{ id: "j1", ot: "202618", job_date: "2026-11-25", status: "updated" }]);
    expect(await screen.findByText("Preuve de temps supp. refusée (OT 202618) : fournir les captures refusées.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fournir les captures" })).toBeTruthy();
  });

  it("is gone once the job is submitted again", async () => {
    setup([message("j1")], [{ id: "j1", ot: "202618", job_date: "2026-11-25", status: "submitted" }]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("ignores the other messages and is hidden for managers", async () => {
    setup([message("j1", { kind: null, meta: {} })], [{ id: "j1", ot: "1", job_date: "2026-11-25", status: "updated" }]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    cleanup();
    setup([message("j1")], [{ id: "j1", ot: "1", job_date: "2026-11-25", status: "updated" }], "manager");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
