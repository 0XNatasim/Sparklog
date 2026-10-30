// @vitest-environment jsdom
// Screen test of the employee time entry (Fiche de travail): the save flow, the double-tap guard,
// the end-of-shift questions, the closed day and locked jobs. Written before the screen was split into
// smaller files (V2.4.178) and kept to lock its behaviour on the time-entry path.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const fr = (key, params) => String(dictionaries.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ""));

const state = vi.hoisted(() => ({ fake: null, drafts: new Map(), auth: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }) => <div data-testid="shell">{children}</div> }));
// IndexedDB is not in jsdom: the local drafts live in a Map for these tests.
vi.mock("@/lib/draft-store", () => {
  const key = ({ userId, editId = null }) => `${userId}:${editId || "new"}`;
  return {
    saveDraft: async (input) => { state.drafts.set(key(input), { ...input, updatedAt: new Date().toISOString() }); return input; },
    loadDraft: async (input) => state.drafts.get(key(input)) || null,
    deleteDraft: async (input) => { state.drafts.delete(key(input)); },
  };
});

const { default: EmployeeForm } = await import("./EmployeeForm");

const TODAY = "2026-10-26"; // a Monday
function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

function setup({ profile = {}, jobs = [], deadline = "23:59", path = "/form", saveJob, inventoryShots = [], inventoryItems = [], parking = [] } = {}) {
  state.auth = { user: { id: "emp-1" }, role: "employee" };
  state.fake = createFakeSupabase({
    tables: {
      profiles: [{ role: "employee", parking_receipts_enabled: false, inventory_screenshots_enabled: false, first_trip_unpaid: false, ...profile }],
      company_time_settings: [{ daily_deadline: deadline, timezone: "America/Toronto" }],
      company_holidays: [],
      job_entry_unlocks: [],
      jobs,
      meal_claims: [],
      inventory_screenshots: inventoryShots,
      inventory_items: inventoryItems,
      parking_receipts: parking,
    },
    rpcs: {
      save_own_job: saveJob || ((call) => [{ id: "job-new", status: call.args.p_submit ? "submitted" : "saved", locked: false }]),
    },
  });
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/form" element={<><EmployeeForm /><Where /></>} /></Routes>
    </MemoryRouter>
  );
}

const field = (id) => document.getElementById(id);
function fill({ ot = "200451", depart = "07:00", arrivee = "07:30", fin = "15:00", km = "42" } = {}) {
  fireEvent.change(field("ot"), { target: { value: ot } });
  fireEvent.change(field("depart"), { target: { value: depart } });
  if (field("arrivee")) fireEvent.change(field("arrivee"), { target: { value: arrivee } });
  fireEvent.change(field("fin"), { target: { value: fin } });
  if (field("km")) fireEvent.change(field("km"), { target: { value: km } });
}
const saveButton = () => screen.queryByRole("button", { name: fr("form.buttons.save") });

beforeEach(() => {
  state.drafts.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`)); // 11:00 in Montréal
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EmployeeForm — new entry", () => {
  it("names the missing fields and keeps Save disabled until the entry is complete", async () => {
    setup();
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "profiles")).toBe(true));
    fireEvent.change(field("ot"), { target: { value: "200451" } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(fr("form.missing.hint", { fields: [fr("form.depart"), fr("form.arrival"), fr("form.end"), fr("form.kmTotal")].join(", ") }))).toBeTruthy();
    fill();
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByText("8h00")).toBeTruthy();
  });

  it("reminds a hand-typed entry about the screenshot, then saves one draft job", async () => {
    setup();
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "company_time_settings")).toBe(true));
    fill();
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: fr("form.manualEntryCheck.continue") }));
    await screen.findByText(fr("form.last.title"));
    fireEvent.click(screen.getByRole("button", { name: fr("common.no") }));
    await screen.findByText(fr("form.return.savedTitle"));
    const saves = state.fake.rpcCalls("save_own_job");
    expect(saves).toHaveLength(1);
    expect(saves[0].args).toMatchObject({
      p_job_id: null, p_submit: false, p_job_date: TODAY, p_ot: "200451",
      p_depart: "07:00", p_arrivee: "07:30", p_fin: "15:00", p_km_total: 42, p_km_aller: 42, p_return_time_minutes: 0,
    });
    expect(saves[0].args.p_submission_key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(state.fake.writes("job_entry_sources")).toHaveLength(1));
    expect(state.fake.writes("job_entry_sources")[0].payload).toMatchObject({ job_id: "job-new", source: "manual" });
    // The form is cleared for the next work order.
    expect(field("ot").value).toBe("");
  });

  it("sends one save when « Non » is tapped twice in a row", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    setup({ saveJob: () => gate.then(() => [{ id: "job-new", status: "saved", locked: false }]) });
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "company_time_settings")).toBe(true));
    fill();
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: fr("form.manualEntryCheck.continue") }));
    const no = await screen.findByRole("button", { name: fr("common.no") });
    fireEvent.click(no);
    fireEvent.click(no);
    await waitFor(() => expect(state.fake.rpcCalls("save_own_job")).toHaveLength(1));
    await act(async () => { release(); });
    await screen.findByText(fr("form.return.savedTitle"));
    expect(state.fake.rpcCalls("save_own_job")).toHaveLength(1);
  });

  it("asks for the overtime proof before saving a last job that takes the day over 8 h", async () => {
    setup();
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "company_time_settings")).toBe(true));
    fill({ depart: "06:00", fin: "15:30" });
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: fr("form.manualEntryCheck.continue") }));
    await screen.findByText(fr("form.last.title"));
    fireEvent.click(screen.getByRole("button", { name: fr("common.yes") }));
    await screen.findByText(fr("form.return.askTitle"));
    fireEvent.click(screen.getByRole("button", { name: fr("common.no") }));
    await screen.findByText(fr("form.evidence.title"));
    expect(state.fake.rpcCalls("save_own_job")).toHaveLength(0);
  });

  it("restores the entry kept on the device", async () => {
    state.drafts.set("emp-1:new", { userId: "emp-1", submissionKey: "kept-key", updatedAt: new Date().toISOString(), data: { job_date: TODAY, ot: "777", depart: "08:00", arrivee: "08:30", fin: "12:00", km_aller: "5" } });
    setup();
    await screen.findByText(fr("form.toasts.draftRestored"));
    expect(field("ot").value).toBe("777");
    expect(field("fin").value).toBe("12:00");
  });

  it("shows the office timesheet without arrival nor kilometres", async () => {
    setup({ profile: { role: "admin" } });
    await screen.findByText(fr("form.debut"));
    expect(field("arrivee")).toBeNull();
    expect(field("km")).toBeNull();
    fill();
    expect(saveButton().disabled).toBe(false);
  });

  it("closes the day after the deadline", async () => {
    setup({ deadline: "08:00" });
    await screen.findByText(fr("form.deadline.passed", { time: "08:00" }));
    expect(field("ot").disabled).toBe(true);
  });
});

describe("EmployeeForm — existing job", () => {
  it("locks a submitted job", async () => {
    setup({
      path: "/form?edit=job-9",
      jobs: [{ id: "job-9", user_id: "emp-1", job_date: "2026-10-23", ot: "190001", depart: "07:00:00", arrivee: "07:20:00", fin: "15:00:00", km_total: 30, km_aller: 30, status: "submitted", locked: true, updated_at: "2026-10-23T20:00:00Z" }],
    });
    await waitFor(() => expect(field("ot").value).toBe("190001"));
    expect(field("depart").value).toBe("07:00");
    expect(field("ot").disabled).toBe(true);
    expect(saveButton()).toBeNull();
    expect(screen.getByText(fr("form.lockedNotice", { status: fr("status.submitted"), saved: fr("status.saved"), updated: fr("status.updated") }))).toBeTruthy();
  });

  const savedJob = { id: "job-5", user_id: "emp-1", job_date: "2026-10-26", ot: "190005", depart: "07:00:00", arrivee: "07:20:00", fin: "12:00:00", km_total: 30, km_aller: 30, status: "saved", locked: false, updated_at: "2026-10-26T13:00:00Z" };

  it("offers the newer draft kept on the device, and uses it when accepted", async () => {
    state.drafts.set("emp-1:job-5", { userId: "emp-1", editId: "job-5", updatedAt: "2026-10-26T14:00:00Z", data: { job_date: "2026-10-26", ot: "190005", depart: "07:00", arrivee: "07:20", fin: "13:30", km_aller: "30" } });
    setup({ path: "/form?edit=job-5", jobs: [savedJob] });
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(field("fin").value).toBe("13:30"));
    expect(screen.getByText(fr("form.toasts.draftRestored"))).toBeTruthy();
  });

  it("drops a draft older than the server copy", async () => {
    state.drafts.set("emp-1:job-5", { userId: "emp-1", editId: "job-5", updatedAt: "2026-10-26T12:00:00Z", data: { job_date: "2026-10-26", ot: "190005", fin: "09:00" } });
    setup({ path: "/form?edit=job-5", jobs: [savedJob] });
    await waitFor(() => expect(field("fin").value).toBe("12:00"));
    await waitFor(() => expect(state.drafts.has("emp-1:job-5")).toBe(false));
    expect(screen.queryByText(fr("form.draft.restoreNewer"))).toBeNull();
  });

  it("falls back to the device draft when the job cannot be read", async () => {
    state.drafts.set("emp-1:job-5", { userId: "emp-1", editId: "job-5", updatedAt: "2026-10-26T14:00:00Z", data: { job_date: "2026-10-26", ot: "190005", depart: "07:00", arrivee: "07:20", fin: "13:30", km_aller: "30" } });
    setup({ path: "/form?edit=job-5", jobs: () => ({ data: null, error: { message: "boom", code: "XX000" } }) });
    await waitFor(() => expect(field("fin").value).toBe("13:30"));
    expect(screen.getByText(fr("form.toasts.draftRestored"))).toBeTruthy();
    expect(screen.queryByText(fr("form.errors.failedLoad"))).toBeNull();
  });

  it("loads the parking amount of a job that has a receipt", async () => {
    setup({
      path: "/form?edit=job-5",
      profile: { parking_receipts_enabled: true },
      jobs: [{ ...savedJob, parking_receipt_captured: true }],
      parking: [{ amount: 8.5, status: "pending", storage_path: "emp-1/p1.jpg", extra_storage_paths: ["emp-1/p2.jpg"] }],
    });
    await waitFor(() => expect(document.getElementById("parking-amount")?.value).toBe("8.5"));
    expect(screen.getByText(fr("form.parking.savedCount", { count: 2 }))).toBeTruthy();
  });

  it("opens the overtime proof by itself when History sends a long day to submit", async () => {
    setup({ path: "/form?edit=job-5&submit=1", jobs: [{ ...savedJob, depart: "06:00:00", fin: "15:30:00" }] });
    await screen.findByText(fr("form.evidence.title"));
    expect(state.fake.rpcCalls("save_own_job")).toHaveLength(0);
  });

  it("refuses to open another employee's job", async () => {
    setup({ path: "/form?edit=job-x", jobs: [{ id: "job-x", user_id: "someone-else", job_date: "2026-10-23", status: "saved" }] });
    // The reason is logged; the employee sees the generic load error with a retry, and an empty form.
    await screen.findByText(fr("form.errors.failedLoad"));
    expect(screen.getByRole("button", { name: fr("common.retry") })).toBeTruthy();
    expect(field("ot").value).toBe("");
  });
});

describe("EmployeeForm — end of the day", () => {
  it("saves the return to the shop, then asks for the inventory and submits the day", async () => {
    const dayJob = { id: "job-new", user_id: "emp-1", job_date: TODAY, ot: "200451", depart: "07:00:00", arrivee: "07:30:00", fin: "15:00:00", km_total: 42, km_aller: 37, km_retour: 5, return_time_minutes: 30, status: "saved", locked: false };
    setup({
      profile: { inventory_screenshots_enabled: true },
      // The day's saved jobs are only listed for the day submission (locked = false filter).
      jobs: (call) => (call.filters.some(([name, column]) => name === "eq" && column === "locked") ? [dayJob] : []),
      inventoryShots: [{ slot: 1, storage_path: "emp-1/inv-1.jpg", ocr_status: "processed" }],
      // A screenshot that read nothing at all now holds « Continuer » (V2.4.215): this one read a line.
      inventoryItems: [{ slot: 1, section: "inventory", code: "EQ000001", name: "Thermostat", quantity: 4 }],
    });
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "company_time_settings")).toBe(true));
    fill();
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: fr("form.manualEntryCheck.continue") }));
    await screen.findByText(fr("form.last.title"));
    fireEvent.click(screen.getByRole("button", { name: fr("common.yes") }));
    await screen.findByText(fr("form.return.askTitle"));
    fireEvent.click(screen.getByRole("button", { name: fr("common.yes") }));
    await screen.findByText(fr("form.return.timeTitle"));
    fireEvent.click(screen.getByRole("button", { name: "30 min" }));
    fireEvent.change(await screen.findByLabelText(fr("form.return.kmLabel")), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: fr("form.buttons.save") }));

    await screen.findByText(fr("form.inventory.title"));
    expect(state.fake.rpcCalls("save_own_job")[0].args).toMatchObject({ p_submit: false, p_return_time_minutes: 30, p_km_total: 42, p_km_aller: 37, p_km_retour: 5 });
    const continueButton = screen.getByRole("button", { name: fr("form.inventory.continue") });
    expect(continueButton.disabled).toBe(true); // the defective-products question is not answered
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.defectiveNo") }));
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);

    fireEvent.click(await screen.findByRole("button", { name: fr("form.day.submit") }));
    await screen.findByText(fr("form.day.submittedTitle"));
    const submit = state.fake.rpcCalls("save_own_job")[1].args;
    expect(submit).toMatchObject({ p_job_id: "job-new", p_submit: true, p_return_time_minutes: 30, p_km_retour: 5 });
  });

  it("refuses a return longer than the work order's kilometres", async () => {
    setup();
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "company_time_settings")).toBe(true));
    fill({ km: "10" });
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: fr("form.manualEntryCheck.continue") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    fireEvent.click(await screen.findByRole("button", { name: "30 min" }));
    fireEvent.change(await screen.findByLabelText(fr("form.return.kmLabel")), { target: { value: "12" } });
    expect(screen.getByText(fr("form.return.kmExceedsTotal"), { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: fr("form.buttons.save") }).disabled).toBe(true);
  });
});

describe("EmployeeForm — parking and autofill", () => {
  it("needs the amount and a receipt once the parking box is ticked", async () => {
    setup({ profile: { parking_receipts_enabled: true } });
    const box = (await screen.findByText(fr("form.parking.title"))).closest("label").querySelector("input");
    fill();
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(box);
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(fr("form.missing.hint", { fields: fr("form.parking.title") }))).toBeTruthy();
    fireEvent.change(document.getElementById("parking-amount"), { target: { value: "8.50" } });
    const choose = screen.getByRole("button", { name: fr("form.parking.chooseReceipts") });
    expect(choose.className).toContain("border-destructive"); // amount entered, picture still missing
    expect(saveButton().disabled).toBe(true);
  });

  it("shows the screenshot tip once, then remembers « don't show again »", async () => {
    window.localStorage.removeItem("autofill_tip_seen");
    setup();
    fireEvent.click(await screen.findByRole("button", { name: fr("form.buttons.autofill") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("form.autofillTip.next") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("form.autofillTip.dontShowAgain") }));
    expect(window.localStorage.getItem("autofill_tip_seen")).toBe("1");
    await waitFor(() => expect(screen.queryByRole("button", { name: fr("form.autofillTip.dontShowAgain") })).toBeNull());
  });
});
