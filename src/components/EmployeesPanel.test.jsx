// @vitest-environment jsdom
// Screen test of Gestion › Employés: what the manager sees and what each action writes. Written before
// the panel was split into smaller files (V2.4.178) and kept to lock its behaviour.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const fr = (key, params) => String(dictionaries.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ""));

const state = vi.hoisted(() => ({ fake: null, auth: { user: { id: "owner-1" }, role: "owner" } }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));

const { default: EmployeesPanel } = await import("./EmployeesPanel");

const base = { type_confirmed: true, is_paused: false, departure_status: null, admin_sections: [], email: null };
const PROFILES = [
  { ...base, id: "zoe", role: "employee", full_name: "Zoé Tremblay", email: "zoe@test.ca", apprentice_level: "compagnon", wage_schedule: "C3", hourly_rate: 40, start_date: "2026-04-05" },
  { ...base, id: "bob", role: "employee", full_name: "Bob Ancien", is_paused: true, departure_status: "depart" },
  { ...base, id: "owner-1", role: "owner", full_name: "Karine Propriétaire" },
  { ...base, id: "alex", role: "employee", full_name: "Alex Nouveau", is_paused: true, type_confirmed: false },
  { ...base, id: "nora", role: "employee", full_name: "Nora Bientôt", start_date: "2026-11-02" },
  { ...base, id: "office", role: "admin", full_name: "Annie Bureau" },
];
const SNAPSHOT = {
  sector_id: "C", skill_id: "6", fetched_at: "2026-10-01T00:00:00Z",
  raw_json: { Annexes: [{ cd_annexe: "C3", desc_annexe: "Commercial" }], AnnexesRates: { "Taux horaire": [{ Name: "Régulier", Rates: { C3: "45,50" } }] } },
};

function setup({ role = "owner", profiles = PROFILES } = {}) {
  state.auth = { user: { id: "owner-1" }, role };
  state.fake = createFakeSupabase({
    tables: { profiles: structuredClone(profiles), ccq_rate_snapshots: [SNAPSHOT], employee_time_off: [] },
    rpcs: {
      pending_signups: [{ user_id: "alex", email_confirmed: true }],
      mfa_enrolled_users: [{ user_id: "owner-1" }],
      push_enabled_users: [{ user_id: "zoe" }],
      nas_presence: [],
    },
  });
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EmployeesPanel /></MemoryRouter>);
}

const cardButtons = () => screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-expanded") && button.closest(".rounded-lg, .rounded-xl"));
const cardNames = () => cardButtons().map((button) => button.querySelector("span.truncate")?.textContent);
const openCard = async (name) => {
  const button = cardButtons().find((b) => b.textContent.includes(name));
  fireEvent.click(button);
  return button.closest("div.rounded-lg, div.rounded-xl");
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EmployeesPanel", () => {
  it("lists owner, office, then crew: new sign-ups, people waiting to start, active, then inactive", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    expect(cardNames()).toEqual(["Karine Propriétaire", "Annie Bureau", "Alex Nouveau", "Nora Bientôt", "Zoé Tremblay", "Bob Ancien"]);
    expect(screen.getByText(fr("employees.status.pending"))).toBeTruthy();
    expect(screen.getByText(fr("employees.status.depart"))).toBeTruthy();
  });

  it("counts each state and filters on a counter", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    expect(screen.getByText(`3 · ${fr("employees.active")}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `1 · ${fr("employees.filter.pending")}` }));
    expect(cardNames()).toEqual(["Alex Nouveau"]);
    fireEvent.click(screen.getByRole("button", { name: `1 · ${fr("employees.filter.pending")}` }));
    expect(cardNames()).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: `1 · ${fr("employees.filter.former")}` }));
    expect(cardNames()).toEqual(["Bob Ancien"]);
  });

  it("only suggests a CCQ rate for a tradesperson, and writes it after the confirmation", async () => {
    setup();
    await screen.findByText(fr("employees.rates.pending", { count: 1 }));
    fireEvent.click(screen.getByRole("button", { name: fr("employees.rates.applyBtn") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    expect(state.fake.writes("profiles")[0]).toMatchObject({ op: "update", payload: { hourly_rate: 45.5, wage_schedule: "C3" }, filters: [["eq", "id", "zoe"]] });
  });

  it("saves a field on blur", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    const card = await openCard("Zoé Tremblay");
    const number = within(card).getByPlaceholderText("09");
    fireEvent.change(number, { target: { value: "12" } });
    fireEvent.blur(number);
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    expect(state.fake.writes("profiles")[0].payload).toEqual({ employee_number: "12" });
  });

  it("refuses a last day worked before the hiring date, without writing", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    const card = await openCard("Zoé Tremblay");
    const last = within(card).getByText(fr("employees.dates.lastWorked")).closest("label").querySelector("input");
    fireEvent.change(last, { target: { value: "2026-03-01" } });
    fireEvent.blur(last);
    await screen.findByText(fr("employees.dates.order"));
    expect(state.fake.writes("profiles")).toHaveLength(0);
  });

  it("pauses an account and refreshes the sign-up badge", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    const card = await openCard("Zoé Tremblay");
    const pause = within(card).getByText(fr("employees.pauseAccount")).closest("label").querySelector("input[type=checkbox]");
    const pendingBefore = state.fake.rpcCalls("pending_signups").length;
    await act(async () => { fireEvent.click(pause); });
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    expect(state.fake.writes("profiles")[0].payload).toEqual({ is_paused: true });
    await waitFor(() => expect(state.fake.rpcCalls("pending_signups").length).toBe(pendingBefore + 1));
  });

  it("asks for a type before a new account can be activated", async () => {
    setup();
    await screen.findByText("Alex Nouveau");
    const card = await openCard("Alex Nouveau");
    const pause = within(card).getByText(fr("employees.pauseAccount")).closest("label").querySelector("input[type=checkbox]");
    expect(pause.disabled).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: fr("employees.typeCcq") }));
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(2));
    expect(state.fake.writes("profiles").map((w) => w.payload)).toEqual([{ role: "employee" }, { type_confirmed: true }]);
  });

  it("shows the role read-only to a manager who is not the owner, and no NAS presence call", async () => {
    setup({ role: "manager" });
    await screen.findByText("Zoé Tremblay");
    const card = await openCard("Zoé Tremblay");
    const role = within(card).getByText(fr("employees.roleLabel")).closest("label").querySelector("input");
    expect(role.readOnly).toBe(true);
    expect(state.fake.rpcCalls("nas_presence")).toHaveLength(0);
  });
});
