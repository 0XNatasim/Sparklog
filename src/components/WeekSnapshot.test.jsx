// @vitest-environment jsdom
// « Cette semaine » / « Semaine passée »: the squares show the time entered, to the minute, and the km of the
// day; under the weekly total, what is paid after the 15-minute rounding, the week's difference and the counter.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/lib/company-holidays", () => ({ useHolidayDates: () => [] }));

const { default: WeekSnapshot } = await import("./WeekSnapshot");

const job = (id, job_date, depart, fin, extra = {}) => ({
  id, user_id: "e1", job_date, depart, arrivee: depart, fin, status: "submitted", km_total: 12, km_aller: 12, km_retour: 0, ...extra,
});

const fr = (key) => dictionaries.fr[key];

function setup(jobs, profileExtra = {}, props = {}) {
  state.fake = createFakeSupabase({
    tables: {
      profiles: [{ id: "e1", full_name: "Employé Test", email: "e@test.invalid", role: "employee", is_paused: false, show_on_boards: true, start_date: "2026-01-05", first_trip_unpaid: false, ...profileExtra }],
      jobs,
      employee_time_off: [],
    },
  });
  return render(<WeekSnapshot {...props} />);
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
    expect(await screen.findByText("payé 16h15 · arr. +1 · cpt +1")).toBeTruthy();
    // The squares keep the time entered, to the minute: 8h07.
    expect(screen.getAllByText("8h07").length).toBe(2);
    expect(screen.getAllByText("12 km").length).toBeGreaterThanOrEqual(2);
  });

  it("marks the paid line when a draft day is not counted", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:00"), job("b", "2026-10-20", "07:00", "15:07", { status: "saved" })]);
    await screen.findByText("Employé Test");
    expect(await screen.findByText("payé 8h00* · arr. 0 · cpt 0")).toBeTruthy();
  });
});

describe("WeekSnapshot columns", () => {
  const headers = () => screen.getAllByRole("columnheader").map((th) => th.textContent);

  it("leaves Saturday and Sunday out when nobody has a day on them", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:07")]);
    await screen.findByText("Employé Test");
    expect(headers()).toHaveLength(7); // employee + Monday to Friday + total
    expect(headers().join(" ")).not.toMatch(/Sat|Sun/);
  });

  it("shows a weekend day as soon as somebody has a day on it", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:07"), job("b", "2026-10-24", "08:00", "12:00")]); // Saturday
    await screen.findByText("Employé Test");
    expect(headers()).toHaveLength(8);
    expect(headers().join(" ")).toMatch(/Sat 24/);
    expect(headers().join(" ")).not.toMatch(/Sun/);
  });
});

describe("WeekSnapshot week filter", () => {
  it("offers this week and the 12 before it, the first two named", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:07")]);
    await screen.findByText("Employé Test");
    const select = screen.getByLabelText(fr("live.week.pick"));
    const options = [...select.querySelectorAll("option")];
    expect(options).toHaveLength(13);
    expect(options[0].textContent).toContain(fr("live.week.current"));
    expect(options[1].textContent).toContain(fr("live.week.previous"));
    expect(select.value).toBe("0");
  });

  it("opens on the week asked for and moves to an earlier one", async () => {
    setup([job("a", "2026-10-12", "07:00", "15:00")], {}, { weekOffset: -1 });
    await screen.findByText(/11 Oct → 17 Oct 2026/);
    expect(screen.getByLabelText(fr("live.week.pick")).value).toBe("-1");
    fireEvent.change(screen.getByLabelText(fr("live.week.pick")), { target: { value: "-2" } });
    await screen.findByText(/04 Oct → 10 Oct 2026/);
    fireEvent.click(screen.getByRole("button", { name: fr("live.week.later") }));
    await screen.findByText(/11 Oct → 17 Oct 2026/);
  });

  it("cannot go past this week, and can step back with the arrow", async () => {
    setup([job("a", "2026-10-19", "07:00", "15:07")]);
    await screen.findByText("Employé Test");
    expect(screen.getByRole("button", { name: fr("live.week.later") }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: fr("live.week.earlier") }));
    await screen.findByText(/11 Oct → 17 Oct 2026/);
    expect(screen.getByRole("button", { name: fr("live.week.later") }).disabled).toBe(false);
  });
});

describe("WeekSnapshot foreman minimum", () => {
  it("flags a weekday under 8 h worked and shows the paid total with the minimum", async () => {
    // Mon 2 h, Tue 9 h: Monday is topped up to 8 h, Tuesday is left alone → paid 17 h.
    setup([job("a", "2026-10-19", "07:00", "09:00"), job("b", "2026-10-20", "07:00", "16:00")], { role: "foreman" });
    await screen.findByText("Employé Test");
    expect(screen.getAllByText(fr("live.week.foremanMin")).length).toBe(1);
    expect(screen.getByText(fr("live.week.foremanPaid").replace("{time}", "17h00"))).toBeTruthy();
  });

  it("shows nothing extra for another role", async () => {
    setup([job("a", "2026-10-19", "07:00", "09:00")]);
    await screen.findByText("Employé Test");
    expect(screen.queryByText(fr("live.week.foremanMin"))).toBeNull();
  });
});

describe("WeekSnapshot overtime proof missing", () => {
  it("outlines a saved day over 8 h that has no proof, and not one that has it", async () => {
    // Mon 9 h saved without proof → outlined; Tue 9 h saved with proof → not.
    setup([
      job("a", "2026-10-19", "06:00", "15:00", { status: "saved", overtime_evidence_captured: false }),
      job("b", "2026-10-20", "06:00", "15:00", { status: "saved", overtime_evidence_captured: true }),
    ]);
    await screen.findByText("Employé Test");
    expect(document.querySelectorAll('button[title="' + fr("live.week.proofMissingTitle") + '"]')).toHaveLength(1);
  });

  it("does not outline a submitted day", async () => {
    setup([job("a", "2026-10-19", "06:00", "15:00", { status: "submitted", overtime_evidence_captured: true })]);
    await screen.findByText("Employé Test");
    expect(document.querySelectorAll('button[title="' + fr("live.week.proofMissingTitle") + '"]')).toHaveLength(0);
  });
});

describe("WeekSnapshot overtime proof with the unpaid first trip and 4 days of 10 h", () => {
  const dayJobs = (extra) => [job("a", "2026-10-19", "06:00", "14:30", { status: "saved", arrivee: "06:45", overtime_evidence_captured: false, ...extra })];
  const outlined = () => document.querySelectorAll('button[title="' + fr("live.week.proofMissingTitle") + '"]').length;

  it("counts paid time: 8 h 30 with a 45-minute unpaid first trip is under 8 h, so not outlined", async () => {
    setup(dayJobs(), { first_trip_unpaid: true });
    await screen.findByText("Employé Test");
    expect(outlined()).toBe(0);
  });

  it("outlines the same day without that option (8 h 30 paid)", async () => {
    setup(dayJobs(), { first_trip_unpaid: false });
    await screen.findByText("Employé Test");
    expect(outlined()).toBe(1);
  });

  it("uses 10 h for « 4 jours de 10 h »: 9 h is not outlined, 11 h is", async () => {
    setup([job("a", "2026-10-19", "06:00", "15:00", { status: "saved", overtime_evidence_captured: false })], { ten_hour_days: true });
    await screen.findByText("Employé Test");
    expect(outlined()).toBe(0);
    cleanup();
    setup([job("a", "2026-10-19", "06:00", "17:00", { status: "saved", overtime_evidence_captured: false })], { ten_hour_days: true });
    await screen.findByText("Employé Test");
    expect(outlined()).toBe(1);
  });
});

