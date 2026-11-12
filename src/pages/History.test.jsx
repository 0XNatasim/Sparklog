// @vitest-environment jsdom
// « Vue en tant que… » (lecture seule): a manager sees the buttons the employee sees on the history, greyed out.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const fr = (key) => dictionaries.fr[key];
const state = vi.hoisted(() => ({ fake: null, auth: null, view: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/contexts/ViewModeContext", () => ({ useViewMode: () => state.view }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }) => <div>{children}</div> }));

const { default: History } = await import("./History");

const job = { id: "j1", user_id: "emp-9", job_date: "2026-11-10", ot: "267929", depart: "06:30:00", arrivee: "07:34:00", fin: "10:44:00", km_total: 30, km_aller: 30, km_retour: 0, return_time_minutes: 0, status: "saved", locked: false, updated_at: "2026-11-10T20:00:00Z" };

function setup({ viewing }) {
  state.auth = { user: { id: viewing ? "mgr-1" : "emp-9" }, role: viewing ? "manager" : "employee" };
  state.view = viewing ? { isViewMode: true, viewedEmployee: { id: "emp-9" } } : { isViewMode: false, viewedEmployee: null };
  state.fake = createFakeSupabase({ tables: { jobs: [job], profiles: [{ role: "employee" }], inventory_screenshots: [], meal_claims: [] } });
  return render(<MemoryRouter><History /></MemoryRouter>);
}

afterEach(cleanup);

describe("History buttons", () => {
  it("are active for the employee", async () => {
    setup({ viewing: false });
    const button = await screen.findByRole("button", { name: fr("history.delete") });
    expect(button.disabled).toBe(false);
  });

  it("are shown but disabled to a manager viewing as the employee", async () => {
    setup({ viewing: true });
    for (const key of ["history.delete", "history.submit", "history.submitDay"]) {
      const button = await screen.findByRole("button", { name: fr(key) });
      await waitFor(() => expect(button.disabled).toBe(true));
    }
  });
});
