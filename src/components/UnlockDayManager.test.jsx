// @vitest-environment jsdom
// Gestion V3 › Feuilles de temps › « Rouvrir une journée » uses plain words (`plainWords`); the V2 page keeps
// « Débloquer ». Both write the same thing.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));
vi.mock("../supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: UnlockDayManager } = await import("./UnlockDayManager");

const fr = (key) => dictionaries.fr[key];

function setup(props) {
  state.fake = createFakeSupabase({ tables: { profiles: [{ id: "zoe", full_name: "Zoé", is_paused: false }], job_entry_unlocks: [] } });
  return render(<UnlockDayManager {...props} />);
}

afterEach(cleanup);

describe("UnlockDayManager wording", () => {
  it("keeps the V2 words by default", async () => {
    setup();
    expect(await screen.findByRole("button", { name: fr("timeRules.unlockDay") })).toBeTruthy();
    expect(screen.getByText(fr("timeRules.noUnlocks"))).toBeTruthy();
  });

  it("says « rouvrir » in V3", async () => {
    setup({ plainWords: true });
    expect(await screen.findByRole("button", { name: fr("timeRules.unlockDay.plain") })).toBeTruthy();
    expect(screen.getByText(fr("timeRules.noUnlocks.plain"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: fr("timeRules.unlockDay") })).toBeNull();
  });

  it("has every plain word in both languages", () => {
    for (const lang of ["fr", "en"]) {
      const plain = Object.keys(dictionaries[lang]).filter((key) => key.endsWith(".plain"));
      expect(plain.length).toBeGreaterThanOrEqual(14);
      for (const key of plain) {
        expect(dictionaries[lang][key.slice(0, -".plain".length)], `${lang} ${key}`).toBeTruthy();
        expect(dictionaries.fr[key] && dictionaries.en[key], key).toBeTruthy();
      }
    }
  });
});

describe("UnlockDayManager bulk actions", () => {
  const two = [{ id: "zoe", full_name: "Zoé", is_paused: false }, { id: "max", full_name: "Max", is_paused: false }];

  it("reopens one day for every active employee with a single write", async () => {
    state.fake = createFakeSupabase({ tables: { profiles: two, job_entry_unlocks: [] } });
    render(<UnlockDayManager plainWords />);
    const select = await screen.findByRole("combobox");
    await waitFor(() => expect(screen.getByRole("option", { name: "Zoé" })).toBeTruthy());
    fireEvent.change(select, { target: { value: "__all__" } });
    fireEvent.click(screen.getByRole("button", { name: fr("timeRules.unlockDay.plain") }));
    await waitFor(() => expect(state.fake.calls.some((c) => c.table === "job_entry_unlocks" && c.op === "upsert")).toBe(true));
    const write = state.fake.calls.find((c) => c.table === "job_entry_unlocks" && c.op === "upsert");
    expect(write.payload.map((row) => row.user_id).sort()).toEqual(["max", "zoe"]);
    expect(write.payload.every((row) => row.unlocked_until === null)).toBe(true);
  });

  it("closes every reopened day with one delete after confirmation", async () => {
    state.fake = createFakeSupabase({ tables: { profiles: two, job_entry_unlocks: [
      { id: "u1", user_id: "zoe", job_date: "2026-11-10" }, { id: "u2", user_id: "max", job_date: "2026-11-10" },
    ] } });
    render(<UnlockDayManager plainWords />);
    fireEvent.click(await screen.findByRole("button", { name: fr("timeRules.removeAll.plain") }));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(screen.getByText(fr("timeRules.allUnlocksRemoved.plain"))).toBeTruthy());
    const del = state.fake.calls.find((c) => c.table === "job_entry_unlocks" && c.op === "delete");
    expect(del.filters).toEqual([["in", "id", ["u1", "u2"]]]);
  });
});
