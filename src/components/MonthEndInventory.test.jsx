// @vitest-environment jsdom
// Inventaire › Inventaire fin de mois (0142): the manager schedules the day for chosen people, sees who gave the proof,
// unblocks someone after a confirmation, and sets the retention. The employee's step sends the pictures at once and only
// records the proof from 5 screenshots.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createFakeSupabase } from "@/test/fake-supabase";

const hoisted = vi.hoisted(() => ({ confirm: vi.fn(), fake: null, upload: vi.fn() }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return hoisted.fake.client; } }));
vi.mock("@/lib/ocr", () => ({ compressImage: vi.fn() }));
vi.mock("@/lib/company-time", async (importOriginal) => ({ ...(await importOriginal()), companyDate: () => "2026-11-30" }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [hoisted.confirm, null] }));
vi.mock("@/lib/month-end-inventory", async (importOriginal) => ({ ...(await importOriginal()), uploadMonthEndFile: hoisted.upload }));

const { default: MonthEndInventory } = await import("./MonthEndInventory");
const { default: MonthEndInventoryStep } = await import("./employee-form/MonthEndInventoryStep");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const t = (key, vars) => fr(key, vars);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setup() {
  hoisted.fake = createFakeSupabase({
    tables: {
      month_end_inventory_rounds: [{ id: "r1", due_date: "2026-11-27" }],
      month_end_inventory_requests: [
        { id: "q1", round_id: "r1", user_id: A, submitted_at: "2026-11-27T20:00:00Z", waived_at: null, waive_reason: null },
        { id: "q2", round_id: "r1", user_id: B, submitted_at: null, waived_at: null, waive_reason: null },
      ],
      month_end_inventory_files: [{ id: "f1", request_id: "q1", storage_path: "a/q1/1.jpg", uploaded_at: "2026-11-27T20:00:00Z", expires_at: "2027-01-26T20:00:00Z", purged_at: null }],
      month_end_inventory_settings: [{ retention_days: 60 }],
      profiles: [{ id: A, full_name: "Personne Un", role: "subcontractor_1", is_paused: false }, { id: B, full_name: "Personne Deux", role: "employee", is_paused: false }],
    },
    rpcs: { schedule_month_end_inventory: null, waive_month_end_inventory_request: null, set_month_end_inventory_retention: null },
  });
}

beforeEach(setup);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rpcCalls = (name) => hoisted.fake.calls.filter((call) => call.rpc === name);

describe("MonthEndInventory (manager)", () => {
  it("lists the people of a day with their state: received, late (the day has passed), with the picture count", async () => {
    render(<MemoryRouter><MonthEndInventory /></MemoryRouter>);
    expect(await screen.findByText(fr("monthEnd.manager.roundTitle", { date: "2026-11-27" }))).toBeTruthy();
    expect(screen.getByText(fr("monthEnd.manager.state.received"))).toBeTruthy();
    expect(screen.getByText(fr("monthEnd.manager.state.late"))).toBeTruthy();
    expect(screen.getByText(fr("monthEnd.manager.filesCount", { count: 1 }))).toBeTruthy();
    expect(screen.getByText(fr("monthEnd.manager.noFile"))).toBeTruthy();
  });

  it("schedules the day for the people ticked, and refuses without anyone", async () => {
    render(<MemoryRouter><MonthEndInventory /></MemoryRouter>);
    await screen.findByText(fr("monthEnd.manager.roundTitle", { date: "2026-11-27" }));
    const submit = screen.getByRole("button", { name: fr("monthEnd.manager.schedule") });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Personne Deux"));
    expect(submit.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(fr("monthEnd.manager.dateLabel")), { target: { value: "2026-12-31" } });
    fireEvent.click(submit);
    await waitFor(() => expect(rpcCalls("schedule_month_end_inventory")).toHaveLength(1));
    expect(rpcCalls("schedule_month_end_inventory")[0].args).toEqual({ p_due_date: "2026-12-31", p_user_ids: [B] });
  });

  it("unblocks a late person only after the confirmation", async () => {
    hoisted.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<MemoryRouter><MonthEndInventory /></MemoryRouter>);
    await screen.findByText(fr("monthEnd.manager.roundTitle", { date: "2026-11-27" }));
    fireEvent.click(screen.getByRole("button", { name: fr("monthEnd.manager.waive") }));
    await waitFor(() => expect(hoisted.confirm).toHaveBeenCalledTimes(1));
    expect(rpcCalls("waive_month_end_inventory_request")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: fr("monthEnd.manager.waive") }));
    await waitFor(() => expect(rpcCalls("waive_month_end_inventory_request")).toHaveLength(1));
    expect(rpcCalls("waive_month_end_inventory_request")[0].args).toMatchObject({ p_request_id: "q2" });
  });

  it("saves the retention in days and refuses a value out of range", async () => {
    render(<MemoryRouter><MonthEndInventory /></MemoryRouter>);
    await screen.findByText(fr("monthEnd.manager.roundTitle", { date: "2026-11-27" }));
    const input = screen.getByLabelText(fr("monthEnd.manager.retentionLabel", { min: 7, max: 365 }));
    expect(input.value).toBe("60");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: fr("common.save") }));
    expect(await screen.findByText(fr("monthEnd.manager.retentionInvalid", { min: 7, max: 365 }))).toBeTruthy();
    expect(rpcCalls("set_month_end_inventory_retention")).toHaveLength(0);
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: fr("common.save") }));
    await waitFor(() => expect(rpcCalls("set_month_end_inventory_retention")).toHaveLength(1));
    expect(rpcCalls("set_month_end_inventory_retention")[0].args).toEqual({ p_days: 90 });
  });
});

describe("MonthEndInventoryStep (employee)", () => {
  const renderStep = (props) => render(<Dialog open><DialogContent><MonthEndInventoryStep t={t} userId={A} {...props} /></DialogContent></Dialog>);
  const png = (name) => new File(["x".repeat(500)], name, { type: "image/png" });

  it("sends each picture at once and enables « Envoyer » only from 5", async () => {
    hoisted.upload.mockResolvedValue({ id: "f", path: "p" });
    hoisted.fake = createFakeSupabase({ rpcs: { submit_month_end_inventory: null } });
    const onSent = vi.fn();
    renderStep({ due: { requestId: "q9", dueDate: "2026-11-30", filesCount: 2 }, onSent, onLater: () => {} });
    const send = screen.getByRole("button", { name: fr("monthEnd.send") });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(fr("monthEnd.choose")), { target: { files: [png("1.png"), png("2.png"), png("3.png")] } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("5 capture(s) envoyée(s)"));
    expect(hoisted.upload).toHaveBeenCalledTimes(3);
    expect(hoisted.upload.mock.calls[0][1]).toEqual({ userId: A, requestId: "q9" });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(rpcCalls("submit_month_end_inventory")[0].args).toEqual({ p_request_id: "q9" });
  });

  it("keeps the sheets as drafts with « Je ne l'ai pas encore » and never records the proof", () => {
    const onLater = vi.fn();
    hoisted.fake = createFakeSupabase();
    renderStep({ due: { requestId: "q9", dueDate: "2026-11-30", filesCount: 0 }, onSent: vi.fn(), onLater });
    fireEvent.click(screen.getByRole("button", { name: fr("monthEnd.notYet") }));
    expect(onLater).toHaveBeenCalled();
    expect(rpcCalls("submit_month_end_inventory")).toHaveLength(0);
  });

  it("says so when a picture cannot be sent and keeps the count", async () => {
    hoisted.upload.mockResolvedValueOnce({ id: "f", path: "p" }).mockRejectedValueOnce(new Error("boom"));
    hoisted.fake = createFakeSupabase();
    renderStep({ due: { requestId: "q9", dueDate: "2026-11-30", filesCount: 0 }, onSent: vi.fn(), onLater: () => {} });
    fireEvent.change(screen.getByLabelText(fr("monthEnd.choose")), { target: { files: [png("1.png"), png("2.png")] } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("1 capture(s) envoyée(s)");
  });
});
