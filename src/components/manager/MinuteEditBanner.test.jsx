// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: MinuteEditBanner } = await import("./MinuteEditBanner");
afterEach(() => cleanup());

const show = (enabled) => {
  state.fake = createFakeSupabase({ tables: { overtime_settings: [{ id: true, minute_edit_enabled: enabled }] } });
  return render(<MemoryRouter><MinuteEditBanner /></MemoryRouter>);
};

describe("MinuteEditBanner", () => {
  it("shows the red reminder only while the special option is on", async () => {
    show(true);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Option spéciale activée/);
  });
  it("shows nothing while it is off", async () => {
    const { container } = show(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });
});
