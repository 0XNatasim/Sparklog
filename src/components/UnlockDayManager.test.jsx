// @vitest-environment jsdom
// Gestion V3 › Feuilles de temps › « Rouvrir une journée » uses plain words (`plainWords`); the V2 page keeps
// « Débloquer ». Both write the same thing.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
