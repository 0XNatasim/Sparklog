// @vitest-environment jsdom
// « Cette semaine » / « Semaine passée »: the squares show the time entered, to the minute, and the km of the
// day; under the weekly total, what is paid after the 15-minute rounding, the week's difference and the counter.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/lib/company-holidays", () => ({ useHolidayDates: () => [] }));

const { default: WeekSnapshot } = await import("./WeekSnapshot");

const job = (id, job_date, depart, fin, extra = {}) => ({
  id, user_id: "e1", job_date, depart, arrivee: depart, fin, status: "submitted", km_total: 12, km_aller: 12, km_retour: 0, ...extra,
});

function setup(jobs, profileExtra = {}) {
  state.fake = createFakeSupabase({
    tables: {
      profiles: [{ id: "e1", full_name: "Employé Test", email: "e@test.invalid", role: "employee", is_paused: false, show_on_boards: true, start_date: "2026-01-05", first_trip_unpaid: false, ...profileExtra }],
      jobs,
      employee_time_off: [],
    },
  });
  return render(<WeekSnapshot />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T16:00:00Z")); // Wednesday of the week Sunday 18 → Saturday 24 October
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WeekSnapshot rounding", () => {
  it("shows what is paid, the week's difference and the counter under the total", async () => {
    // Mon 8h07 → 8h00 (−7, counter −7); Tue 8h07 → 7 min carried over: 487 + 7 = 494 → 8h15 (+8, counter +1).
    setup([job("a", "2026-10-19", "07:00", "15:07"), job("b", "2026-10-20", "07:00", "15:07")]);
    await screen.findByText("Employé Test");
    expect(await screen.findByText(/payé 16h15/)).toBeTruthy();
    expect(screen.getByText("arrondi +1 min · compteur +1 min")).toBeTruthy();
    // The squares keep the time entered, to the minute: 8h07.
    expect(screen.getAllByText("8h07").length).toBe(2);
    expect(screen.getAllByText("12 km").length).toBeGreaterThanOrEqual(2);
  });

  it("marks the paid line when a draft day is not counted", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:00"), job("b", "2026-10-20", "07:00", "15:07", { status: "saved" })]);
    await screen.findByText("Employé Test");
    expect(await screen.findByText("payé 8h00 *")).toBeTruthy();
  });
});
