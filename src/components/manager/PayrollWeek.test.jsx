// @vitest-environment jsdom
// Paie de la semaine: a column shows each employee's rounding of the week (difference and counter at the end of
// the week), next to the hours, which are already rounded.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "manager" }) }));
vi.mock("../../contexts/AuthProvider", () => ({ useAuth: () => ({ role: "manager" }) }));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirmDialog: () => [async () => true, null] }));
vi.mock("@/components/WeeklyReportButton", () => ({ default: () => null }));

const { default: PayrollWeek } = await import("./PayrollWeek");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);
const job = (id, job_date, depart, fin) => ({ id, user_id: "e1", job_date, depart, arrivee: depart, fin, status: "approved", km_total: 0, km_aller: 0, km_retour: 0, return_time_minutes: 0 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T16:00:00Z")); // the last completed week ends Saturday 24 October
  state.fake = createFakeSupabase({
    tables: {
      profiles: [{ id: "e1", full_name: "Employé Test", role: "employee", hourly_rate: 40, apprentice_level: "compagnon", union_association: "FTQ", first_trip_unpaid: false }],
      jobs: [job("a", "2026-10-19", "07:00", "15:07"), job("b", "2026-10-20", "07:00", "15:07")],
    },
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PayrollWeek rounding column", () => {
  it("shows the week's difference and the counter at the end of the week", async () => {
    render(<MemoryRouter><PayrollWeek /></MemoryRouter>);
    await screen.findByText("Employé Test");
    expect(screen.getAllByText(fr("payWeek.col.rounding")).length).toBeGreaterThan(0);
    // Mon 8h07 → 8h00 (−7), Tue 8h07 → 8h15 (+8): +1 for the week, counter +1.
    expect(await screen.findByText("+1 min")).toBeTruthy();
    expect(screen.getByText("compteur +1 min")).toBeTruthy();
  });
});
