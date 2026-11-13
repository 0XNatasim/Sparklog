// @vitest-environment jsdom
// The foreman note icon: red while unread (per manager), blue otherwise, opens the text and reports each opening.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));

const { default: ForemanNoteIcon } = await import("./ForemanNoteIcon");

const fr = (key) => dictionaries.fr[key];
const note = { audited_name: "Paul Roy", body: "Casque oublié", created_at: "2026-11-10T20:00:00Z" };

afterEach(cleanup);

describe("ForemanNoteIcon", () => {
  it("is blue by default (the foreman's own view)", () => {
    render(<ForemanNoteIcon note={note} />);
    const button = screen.getByRole("button", { name: fr("foremanNotes.cardIcon") });
    expect(button.className).toContain("text-blue-600");
    expect(button.className).not.toContain("text-red-600");
  });

  it("is red while unread, and opening it shows the text and reports the reading", () => {
    const onOpen = vi.fn();
    render(<ForemanNoteIcon note={note} unread onOpen={onOpen} subtitle="Éric · CONTREMAÎTRE" />);
    const button = screen.getByRole("button", { name: fr("foremanNotes.cardIconUnread") });
    expect(button.className).toContain("text-red-600");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Casque oublié")).toBeTruthy();
    expect(screen.getByText("Paul Roy")).toBeTruthy();
  });

  it("renders nothing without a note", () => {
    const { container } = render(<ForemanNoteIcon note={null} />);
    expect(container.firstChild).toBeNull();
  });
});
