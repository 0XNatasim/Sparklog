// @vitest-environment jsdom
// « Semaine » : un contremaître voit ses 8 h minimum (prime) dans le 1x ; le retour n'est plus « sans av. soc. ».
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const fr = (key) => dictionaries.fr[key];
const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "emp-1" }, role: "employee" }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "emp-1" }, role: "employee" }) }));
vi.mock("@/contexts/ViewModeContext", () => ({ useViewMode: () => ({ isViewMode: false, viewedEmployee: null }) }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }) => <div>{children}</div> }));

const { default: Week } = await import("./Week");

// Dimanche 2026-11-29 → samedi 12-05 : mardi 3 h, mercredi 8 h.
const job = (id, date, depart, fin) => ({ id, user_id: "emp-1", job_date: date, ot: "123456", depart, arrivee: depart, fin, km_total: 10, km_aller: 10, km_retour: 0, return_time_minutes: 0, status: "approved" });
const jobs = [job("a", "2026-12-01", "07:00:00", "10:00:00"), job("b", "2026-12-02", "07:00:00", "15:00:00")];

function setup(role) {
  state.fake = createFakeSupabase({ tables: { jobs, profiles: [{ role }], employee_day_rounding: [] } });
  return render(<MemoryRouter><Week /></MemoryRouter>);
}
afterEach(cleanup);

describe("Week (foreman top-up)", () => {
  it("shows the 8 h minimum as regular time with a top-up line for a foreman", async () => {
    setup("foreman");
    expect(await screen.findByText(`${fr("week.foremanTopUp")}:`)).toBeTruthy();
    expect(screen.getAllByText("5h00").length).toBeGreaterThan(0); // 8 h − 3 h
    expect(screen.getAllByText("16h00").length).toBeGreaterThan(0);
  });

  it("shows no top-up line for another role", async () => {
    setup("employee");
    await screen.findByText(`${fr("week.regular")}:`);
    expect(screen.queryByText(`${fr("week.foremanTopUp")}:`)).toBeNull();
  });

  it("labels the return simply « Retour »", () => {
    expect(fr("week.returnNoBenefit")).toBe("Retour");
  });
});
