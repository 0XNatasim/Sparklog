// @vitest-environment jsdom
// The foreman's note shows as a clickable icon on the work sheet the manager reviews (0136).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const { default: JobCard } = await import("./JobCard");

const fr = (key) => dictionaries.fr[key];
const job = { id: "j1", user_id: "f1", job_date: "2026-11-10", ot: "CONTREMAÎTRE", depart: "06:30:00", arrivee: "06:30:00", fin: "15:00:00", km_total: 0, km_aller: 0, km_retour: 0, status: "submitted", updated_at: "2026-11-10T21:00:00Z" };
const employee = { id: "f1", full_name: "Éric Foreman" };
const props = { job, employee, shaded: false, dayOvertimeNoEvidence: false, overtimeCaptured: false, mealCaptured: false, manualEntry: false, focused: false, focusedEvidence: null, busy: false, onApprove: () => {}, onUnlock: () => {} };

afterEach(cleanup);

describe("JobCard foreman note", () => {
  it("shows no icon without a note", () => {
    render(<JobCard {...props} />);
    expect(screen.queryByRole("button", { name: fr("foremanNotes.cardIcon") })).toBeNull();
  });

  it("opens the note from the icon", () => {
    render(<JobCard {...props} foremanNote={{ audited_name: "Paul Roy", body: "Casque oublié" }} />);
    fireEvent.click(screen.getByRole("button", { name: fr("foremanNotes.cardIcon") }));
    expect(screen.getByText("Casque oublié")).toBeTruthy();
    expect(screen.getByText("Paul Roy")).toBeTruthy();
  });
});
